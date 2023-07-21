import {
    Notification,
    NotificationType,
    removeNotification,
    setNotification,
} from '@/features/notification/notificationSlice';
import { getLoyaltyDetails, getPaymentSize } from '@/features/payment-details/paymentDetailsSlice';
import { fetchWalletBalance, getBalance } from '@/features/wallet/walletSlice';
import { AppDispatch } from '@/store';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

const WalletHandler: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { publicKey } = useWallet();

    const usdcBalance = useSelector(getBalance);
    const paymentSize = useSelector(getPaymentSize);

    const loyaltyDetails = useSelector(getLoyaltyDetails);

    useEffect(() => {
        if (publicKey) {
            dispatch(fetchWalletBalance(publicKey.toBase58()));
        } else {
            dispatch(removeNotification());
        }
    }, [dispatch, publicKey, loyaltyDetails]);

    useEffect(() => {
        if (usdcBalance != null && paymentSize != null && usdcBalance < paymentSize) {
            dispatch(
                setNotification({ notification: Notification.insufficentFunds, type: NotificationType.connectWallet })
            );
        } else if (usdcBalance != null && paymentSize != null && usdcBalance >= paymentSize) {
            dispatch(removeNotification());
        }

        return () => {};
    }, [dispatch, usdcBalance, paymentSize]);

    return null;
};

export default WalletHandler;
