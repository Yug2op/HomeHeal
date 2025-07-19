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
    deactivateTechnicianById,
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

// Public routes
router.route('/register')
    .post(
        upload.fields([
            { name: 'avatar', maxCount: 1 },
            { name: 'idProof', maxCount: 1 },
            { name: 'addressProof', maxCount: 1 },
            { name: 'certificates', maxCount: 5 }
        ]),
        registerTechnician
    );

// Apply JWT authentication to all routes below this point
router.use(verifyJWT);

// Get all technicians (Admin/Manager only)
router.route('/')
    .get(isAdminOrPartner, getAllTechnicians);

// Get, update technician profile (Technician only)
router.route('/profile')
    .get(getTechnicianProfile)
    .patch(
        upload.fields([
            { name: 'avatar', maxCount: 1 },
            { name: 'documents', maxCount: 5 }
        ]),
        updateTechnicianProfile
    );

// Update technician availability (Technician only)
router.route('/availability')
    .patch(updateTechnicianAvailability);

// Job Management Routes
router.route('/bookings')
    .get(getAssignedBookings);

// {TO BE CHECKED}
router.route('/bookings/:bookingId')
    .get(getBookingDetails)
    .patch(updateJobStatus);

// {TO BE CHECKED}
router.route('/bookings/:bookingId/assignment')
    .patch(updateBookingAssignment);

// Ratings and Feedback
router.route('/ratings')
    .get(getRatingsAndFeedback);

// Job Statistics
router.route('/stats')
    .get(getJobStats);

// Admin/Manager Routes

// Get, delete specific technician (Admin/Partner only)
router.route('/unverified')
    .get(isAdminOrPartner, getUnverifiedTechnicians);

// {TO BE CHECKED}
router.route('/:technicianId/:partnerId')
    .patch(isAdminOrPartner, assignTechnicianToPartner);

router.route('/:technicianId/status')
    .patch(isAdminOrPartner, changeTechnicianStatus);

// Partner Dashboard
router.route('/partner/:partnerId')
    .get(getTechniciansByPartnerId);

router.route('/:id')
    .get(isAdminOrPartner, getTechnicianById)
    .patch(isAdminOrPartner, deactivateTechnicianById)
    .delete(isAdminOrPartner, deleteTechnicianById);



export default router;
