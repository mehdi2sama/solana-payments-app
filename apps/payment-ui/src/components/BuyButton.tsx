import * as Button from '@/components/Button';
import {
    Notification,
    NotificationType,
    getConnectWalletNotification,
    setNotification,
} from '@/features/notification/notificationSlice';
import { getPaymentId } from '@/features/payment-details/paymentDetailsSlice';
import { resetSession } from '@/features/payment-session/paymentSessionSlice';
import { AppDispatch } from '@/store';
import { buildTransactionRequestEndpoint } from '@/utility/endpoints.utility';
import { useWallet } from '@solana/wallet-adapter-react';
import * as web3 from '@solana/web3.js';
import axios from 'axios';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

const BuyButton = () => {
    const paymentId = useSelector(getPaymentId);
    const { publicKey, sendTransaction } = useWallet();
    const dispatch = useDispatch<AppDispatch>();
    const connectedWalletNotification = useSelector(getConnectWalletNotification);
    const [walletLoading, setWalletLoading] = useState(false);

    const fetchAndSendTransaction = async () => {
        const getErrorType = (error: any) => {
            if (error instanceof Error) {
                const message = error.message.toLowerCase();
                if (message.includes('user rejected')) return Notification.declined;
                if (message.includes('0x0') && message.includes('instruction 0')) return Notification.duplicatePayment;
                if (message.includes('0x1') && message.includes('instruction 1')) return Notification.insufficentFunds;
                if (message === 'Transaction string is null') return Notification.transactionRequestFailed;
                if (message === 'Failed to parse transaction string') return Notification.transactionRequestFailed;
            }
            return Notification.simulatingIssue;
        };

        if (paymentId == null) {
            dispatch(setNotification({ notification: Notification.noPayment, type: NotificationType.connectWallet }));
            return;
        }

        if (publicKey == null) {
            dispatch(setNotification({ notification: Notification.noWallet, type: NotificationType.connectWallet }));
            return;
        }

        const transactionRequestEndpoint = buildTransactionRequestEndpoint(paymentId);

        setWalletLoading(true);

        try {
            const response = await axios.post(
                transactionRequestEndpoint,
                { account: publicKey.toBase58() },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            const transactionString = response.data.transaction;
            if (!transactionString) {
                throw new Error('Transaction string is null');
            }

            let transaction: web3.Transaction;

            try {
                const buffer = Buffer.from(transactionString, 'base64');
                transaction = web3.Transaction.from(buffer);
            } catch (error) {
                throw new Error('Failed to parse transaction string');
            }

            const connection = new web3.Connection(
                'https://rpc.helius.xyz/?api-key=5f70b753-57cb-422b-a018-d7df67b4470e'
            );
            await sendTransaction(transaction, connection);
        } catch (error) {
            const errorType = getErrorType(error);
            setWalletLoading(false);
            dispatch(resetSession());
            dispatch(
                setNotification({
                    notification: errorType,
                    type: NotificationType.connectWallet,
                })
            );
            return;
        }
    };

    const isDisabled = () => {
        if (connectedWalletNotification == Notification.insufficentFunds) {
            return true;
        } else if (paymentId == null) {
            return true;
        } else if (walletLoading) {
            return true;
        }
    };

    return (
        <Button.Primary
            disabled={isDisabled()}
            pending={walletLoading}
            onClick={async () => {
                await fetchAndSendTransaction();
            }}
            className="bg-black text-white w-full shadow-lg "
        >
            Buy now
        </Button.Primary>
    );
};

export default BuyButton;
