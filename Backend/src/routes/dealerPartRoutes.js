import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    createPart,
    getDealerParts,
    getPartById,
    updatePart,
    deletePart,
    updateStock
} from '../controllers/dealerPartController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyJWT);

// Apply dealer role check to all routes
router.use((req, res, next) => {
    if (req.user.role !== 'dealer' ) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Dealers only.'
        });
    }
    next();
});

// Part management routes
router.route('/')
    .post(createPart)          // Create a new part
    .get(getDealerParts);      // Get all parts for the dealer

router.route('/:id')
    .get(getPartById)          // Get part details
    .put(updatePart)           // Update part details
    .delete(deletePart);       // Delete a part

// Stock management
router.route('/:id/stock')
    .patch(updateStock);       // Update part stock

export default router;
