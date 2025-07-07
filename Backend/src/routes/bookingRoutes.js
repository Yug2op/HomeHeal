import express from 'express';
import {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBookingById,
    deleteBookingById,
    getUserBookings,
    updateBookingStatus,
    cancelBooking,
    assignTechnicianToBooking,
    markBookingCompleted,
    rescheduleBooking,
    uploadSelfie,
    uploadBeforeImage,
    uploadAfterImage,
    createBulkBooking,
    submitBookingFeedback,
    getBookingFeedback,
    getBookingsByRegion,
    getBookingsByStatus,
    getBookingAnalytics,
    markTechnicianReached,
    generateBookingOtp,
    verifyBookingOtp
} from '../controllers/bookingController.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { isAdminOrManager } from '../middlewares/role.middleware.js';
import { upload } from '../utils/multer.js';

const router = express.Router();

// Apply JWT verification to all booking routes
router.use(verifyJWT);

// ============================================
// 🔹 Public Booking Routes (for authenticated users)
// ============================================

// Create a new booking
router.route('/')
    .post(createBooking);

// Get current user's bookings
router.route('/my-bookings')
    .get(getUserBookings);

// ============================================
// 🔹 Admin/Manager Only Routes
// ============================================

// Admin/Manager analytics and filtered views
router.route('/analytics')
    .get(isAdminOrManager, getBookingAnalytics);  // Get booking analytics

// Get all bookings (admin/manager only)
router.route('/all')
    .get(isAdminOrManager, getAllBookings);

// Get bookings by region (admin/manager only)
router.route('/region')
    .get(isAdminOrManager, getBookingsByRegion);

// Get bookings by status (admin/manager only)
router.route('/status/:status')
    .get(isAdminOrManager, getBookingsByStatus);

// ============================================
// 🔹 Booking Management Routes
// ============================================

// Basic CRUD operations for a specific booking
router.route('/:id')
    .get(getBookingById)                    // Get booking details
    .patch(updateBookingById)               // Update booking details
    .delete(isAdminOrManager, deleteBookingById);  // Delete booking (admin/manager only)

// Booking status management
router.route('/:id/status')
    .patch(updateBookingStatus);            // Update booking status

router.route('/:id/cancel')
    .post(cancelBooking);                   // Cancel a booking

router.route('/:id/reschedule')
    .patch(rescheduleBooking);              // Reschedule a booking

// ============================================
// 🔹 Technician Management Routes
// ============================================

router.route('/:id/technician/assign')
    .patch(isAdminOrManager, assignTechnicianToBooking);  // Assign technician to booking

// OTP Verification Routes
router.route('/:id/otp')
    .post(generateBookingOtp)           // Generate and send OTP
    .put(verifyBookingOtp);             // Verify OTP

// Technician location and OTP flow
router.route('/:id/technician/reached')
    .post(markTechnicianReached);  // Mark technician as reached

router.route('/:id/otp')
    .post(generateBookingOtp)      // Generate OTP (after reaching)
    .put(verifyBookingOtp);        // Verify OTP (user enters OTP)

// Upload selfie when technician reaches location
router.route('/:id/technician/selfie')
    .post(upload.single('selfie'), uploadSelfie);  // Upload technician selfie
    
router.route('/:id/before-image')
    .post(upload.single('beforeImage'), uploadBeforeImage);  // Upload before image

router.route('/:id/after-image')
    .post(upload.single('afterImage'), uploadAfterImage);  // Upload after image

router.route('/:id/complete')
    .patch(markBookingCompleted);            // Mark booking as completed

router.route('/:id/bulk')
    .post(createBulkBooking);                 // Create bulk booking

// Feedback routes
router.route('/:id/feedback')
    .post(submitBookingFeedback)              // Submit feedback for a booking
    .get(getBookingFeedback);                 // Get feedback for a booking

export default router;
