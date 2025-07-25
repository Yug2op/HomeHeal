import express from 'express';
import {
    getCurrentUser,
    getUserById,
    getAllUsers,
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    updateUserProfile,
    changeUserPassword,
    addAddress,
    getUserAddress,
    removeAddress,
    getUserAddressById,
    updateAddress,
    uploadAvatar,
    getSubscriptionDetails,
    updateSubscription,
    cancelSubscription
} from '../controllers/userController.js';
import { upload } from '../utils/multer.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes
router.post('/register', upload.single('avatar'), registerUser);
router.post('/login', loginUser);
router.post('/refresh-token', refreshAccessToken);
router.get('/all-users', getAllUsers);
router.get('/get-user/:userId', getUserById);

// Protected routes
router.use(verifyJWT); // All routes after this will use verifyJWT middleware

// User routes
router.get('/get-current-user', getCurrentUser);
router.post('/logout', logoutUser);

// Profile management routes
router.patch('/profile', updateUserProfile);
router.patch('/change-password', changeUserPassword);

// Address management routes
router.post('/addresses', addAddress);
router.get('/addresses', getUserAddress);
router.get('/addresses/:addressId', getUserAddressById);
router.patch('/addresses/:addressId', updateAddress);
router.delete('/addresses/:addressId', removeAddress);

// Avatar management
router.patch('/update-avatar', upload.single('avatar'), uploadAvatar);

// Subscription management routes
router.get('/subscription-details', getSubscriptionDetails);
router.post('/update-subscription', updateSubscription);
router.delete('/cancel-subscription', cancelSubscription);

export default router;