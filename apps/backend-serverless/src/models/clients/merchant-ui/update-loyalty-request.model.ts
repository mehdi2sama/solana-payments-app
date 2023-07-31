import { InferType, boolean, number, object, string } from 'yup';
import { parseAndValidateStrict } from '../../../utilities/yup.utility.js';
import { publicKeySchema } from '../../public-key-schema.model.js';

export const updateLoyaltyRequestBodySchema = object().shape({
    loyaltyProgram: string().oneOf(['points', 'tiers', 'none']).optional(),
    points: object().shape({
        mint: string().optional(),
        back: number().optional(),
    }),
    tiers: object()
        .shape({
            id: number().optional(),
            name: string().optional(),
            threshold: number().optional(),
            discount: number().optional(),
            active: boolean().optional(),
        })
        .optional(),
    products: object()
        .shape({
            id: string().optional(),
            active: boolean().optional(),
        })
        .optional(),
    payer: publicKeySchema.optional(),
});

export type UpdateLoyaltyRequest = InferType<typeof updateLoyaltyRequestBodySchema>;

export const parseAndValidateUpdateLoyaltyRequestBody = (updateLoyaltyRequestBody: unknown): UpdateLoyaltyRequest => {
    return parseAndValidateStrict(
        updateLoyaltyRequestBody,
        updateLoyaltyRequestBodySchema,
        'Could not parse the update loyalty request body. Unknown Reason.'
    );
};