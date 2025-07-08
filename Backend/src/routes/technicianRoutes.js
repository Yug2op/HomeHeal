import { Router } from 'express';
import { upload } from '../utils/multer.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { isAdminOrPartner } from '../middlewares/role.middleware.js';
import {
    registerTechnician,
    getTechnicianProfile,
    updateTechnicianProfile,
    updateTechnicianAvailability,
    getAllTechnicians,
    getTechnicianById,
    deleteTechnicianById,
    getAssignedBookings,
    getBookingDetails,
    updateBookingAssignment,
    updateJobStatus,
    getRatingsAndFeedback,
    getJobStats,
    assignTechnicianToPartner,
    getUnverifiedTechnicians,
    changeTechnicianStatus,
    getTechniciansByPartnerId
} from '../controllers/technicianController.js';

const router = Router();

// Secure all routes with JWT authentication
router.use(verifyJWT);

// Register a new technician (Admin/Partner only)
router.route('/')
    .post(
        isAdminOrPartner,
        upload.fields([
            { name: 'profilePicture', maxCount: 1 },
            { name: 'idProof', maxCount: 1 },
            { name: 'addressProof', maxCount: 1 },
            { name: 'certificates', maxCount: 5 }
        ]),
        registerTechnician
    );

// Get all technicians (Admin/Manager only)
router.route('/')
    .get(isAdminOrPartner, getAllTechnicians);

// Get, update technician profile (Technician only)
router.route('/profile')
    .get(getTechnicianProfile)
    .patch(
        upload.fields([
            { name: 'profilePicture', maxCount: 1 },
            { name: 'documents', maxCount: 5 }
        ]),
        updateTechnicianProfile
    );

// Update technician availability (Technician only)
router.route('/availability')
    .patch(updateTechnicianAvailability);

// Get, delete specific technician (Admin/Partner only)
router.route('/:id')
    .get(isAdminOrPartner, getTechnicianById)
    .delete(isAdminOrPartner, deleteTechnicianById);

// Job Management Routes
router.route('/bookings')
    .get(verifyJWT, getAssignedBookings);

router.route('/bookings/:bookingId')
    .get(verifyJWT, getBookingDetails)
    .patch(verifyJWT, updateJobStatus);

router.route('/bookings/:bookingId/assignment')
    .patch(verifyJWT, updateBookingAssignment);

// Ratings and Feedback
router.route('/ratings')
    .get(verifyJWT, getRatingsAndFeedback);

// Job Statistics
router.route('/stats')
    .get(verifyJWT, getJobStats);

// Admin/Manager Routes
router.route('/unverified')
    .get(verifyJWT, isAdminOrPartner, getUnverifiedTechnicians);

router.route('/:technicianId/assign-partner')
    .patch(verifyJWT, isAdminOrPartner, assignTechnicianToPartner);

router.route('/:technicianId/status')
    .patch(verifyJWT, isAdminOrPartner, changeTechnicianStatus);

// Partner Dashboard
router.route('/partner/:partnerId')
    .get(verifyJWT, getTechniciansByPartnerId);

export default router;
