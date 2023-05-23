import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PaymentRecord, PrismaClient, TransactionType } from '@prisma/client';
import { requestErrorResponse } from '../../utilities/request-response.utility.js';
import { TransactionRequestResponse } from '../../models/transaction-request-response.model.js';
import { fetchPaymentTransaction } from '../../services/transaction-request/fetch-payment-transaction.service.js';
import {
    PaymentTransactionRequestParameters,
    parseAndValidatePaymentTransactionRequest,
} from '../../models/payment-transaction-request-parameters.model.js';
import { encodeBufferToBase58 } from '../../utilities/encode-transaction.utility.js';
import { decode } from '../../utilities/string.utility.js';
import queryString from 'query-string';
import { encodeTransaction } from '../../utilities/encode-transaction.utility.js';
import { web3 } from '@project-serum/anchor';
import { fetchGasKeypair } from '../../services/fetch-gas-keypair.service.js';
import { TransactionRecordService } from '../../services/database/transaction-record-service.database.service.js';
import { PaymentRecordService } from '../../services/database/payment-record-service.database.service.js';
import { MerchantService } from '../../services/database/merchant-service.database.service.js';
import { generateSingleUseKeypairFromPaymentRecord } from '../../utilities/generate-single-use-keypair.utility.js';
import { uploadSingleUseKeypair } from '../../services/upload-single-use-keypair.service.js';
import { TrmService } from '../../services/trm-service.service.js';
import * as Sentry from '@sentry/serverless';

Sentry.AWSLambda.init({
    dsn: 'https://dbf74b8a0a0e4927b9269aa5792d356c@o4505168718004224.ingest.sentry.io/4505168722526208',
    tracesSampleRate: 1.0,
});

export const paymentTransaction = Sentry.AWSLambda.wrapHandler(
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        let paymentRecord: PaymentRecord | null;
        let paymentTransaction: TransactionRequestResponse;
        let paymentRequest: PaymentTransactionRequestParameters;
        let transaction: web3.Transaction;

        const prisma = new PrismaClient();
        const transactionRecordService = new TransactionRecordService(prisma);
        const paymentRecordService = new PaymentRecordService(prisma);
        const merchantService = new MerchantService(prisma);

        const TRM_API_KEY = process.env.TRM_API_KEY;

        if (TRM_API_KEY == null) {
            return requestErrorResponse(new Error('Missing internal config.'));
        }

        const trmService = new TrmService(TRM_API_KEY);

        if (event.body == null) {
            return requestErrorResponse(new Error('No body provided.'));
        }

        const body = JSON.parse(event.body);

        const account = body['account'] as string | null;

        if (account == null) {
            return requestErrorResponse(new Error('No account provided.'));
        }

        try {
            paymentRequest = parseAndValidatePaymentTransactionRequest(event.queryStringParameters);
        } catch (error) {
            return requestErrorResponse(error);
        }

        let gasKeypair: web3.Keypair;

        try {
            gasKeypair = await fetchGasKeypair();
        } catch (error) {
            return requestErrorResponse(error);
        }

        try {
            paymentRecord = await paymentRecordService.getPaymentRecord({
                id: paymentRequest.paymentId,
            });
        } catch (error) {
            return requestErrorResponse(error);
        }

        if (paymentRecord == null) {
            return requestErrorResponse(new Error('Payment record not found.'));
        }

        const merchant = await merchantService.getMerchant({
            id: paymentRecord.merchantId,
        });

        if (merchant == null) {
            return requestErrorResponse(new Error('Merchant not found.'));
        }

        const singleUseKeypair = await generateSingleUseKeypairFromPaymentRecord(paymentRecord);

        try {
            await uploadSingleUseKeypair(singleUseKeypair, paymentRecord);
        } catch (error) {
            // TODO: Log this error in sentry
        }

        try {
            paymentTransaction = await fetchPaymentTransaction(
                paymentRecord,
                merchant,
                account,
                gasKeypair.publicKey.toBase58(),
                singleUseKeypair.publicKey.toBase58(),
                gasKeypair.publicKey.toBase58()
            );
        } catch (error) {
            return requestErrorResponse(error);
        }

        try {
            await trmService.screenAddress(account);
        } catch (error) {
            // TODO: Check trm error code to see if it failed or was rejected, if it's failed we can try again
            // if it's rejected, we need to reject the payment sessions
            return requestErrorResponse(error);
        }

        try {
            transaction = encodeTransaction(paymentTransaction.transaction);
        } catch (error) {
            return requestErrorResponse(error);
        }

        transaction.partialSign(gasKeypair);
        transaction.partialSign(singleUseKeypair);

        const transactionSignature = transaction.signature;

        if (transactionSignature == null) {
            return requestErrorResponse(new Error('No transaction signature.'));
        }

        const signatureBuffer = transactionSignature;

        const signatureString = encodeBufferToBase58(signatureBuffer);

        try {
            await transactionRecordService.createTransactionRecord(
                signatureString,
                TransactionType.payment,
                paymentRecord.id,
                null
            );
        } catch (error) {
            return requestErrorResponse(error);
        }

        const transactionBuffer = transaction.serialize({
            verifySignatures: false,
            requireAllSignatures: false,
        });
        const transactionString = transactionBuffer.toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify(
                {
                    transaction: transactionString,
                    message: 'gm',
                },
                null,
                2
            ),
        };
    },
    {
        captureTimeoutWarning: false, // Adjust this according to your needs
    }
);

export const paymentMetadata = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                label: 'Solana Payment App',
                icon: 'https://solana.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FsolanaGradient.cc822962.png&w=3840&q=75',
            },
            null,
            2
        ),
    };
};