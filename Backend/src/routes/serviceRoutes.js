import express from 'express';
import { verifyJWT} from '../middlewares/auth.middleware.js';
import {isAdminOrManager} from '../middlewares/role.middleware.js';
import { 
    createService,
    getServices, 
    getServiceById, 
    getServiceCategories,
    updateService,
    deleteService,
} from '../controllers/serviceController.js';
import { upload } from '../utils/multer.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', getServices);
router.get('/categories', getServiceCategories);
router.get('/:id', getServiceById);

// Protected routes (require authentication & admin/manager role)
router.use(verifyJWT, isAdminOrManager);

// Create a new service
router.post(
    '/',
    upload.single('image'), // Handle single file upload with field name 'image'
    createService
);

// Update a service
router.put(
    '/:id',
    upload.single('image'), // Handle single file upload with field name 'image'
    updateService
);

// Delete a service (soft delete)
router.delete('/:id', deleteService);

export default router;
