import express from 'express';
import { verifyJWT, isTechnician } from '../middlewares/auth.middleware.js';
import { addPartsToBooking, removePartFromBooking } from '../controllers/partBookingController.js';

const router = express.Router();

// Verify JWT on all routes
router.use(verifyJWT);

// Routes for managing parts in a booking
router
  .route('/:id/parts')
  .post(isTechnician, addPartsToBooking);

router
  .route('/:id/parts/:partId')
  .delete(isTechnician, removePartFromBooking);

export default router;
