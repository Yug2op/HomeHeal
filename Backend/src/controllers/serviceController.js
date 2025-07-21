import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiErrors.js';
import { Service } from '../models/Service.model.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import {cleanupTempFile} from '../utils/CleanupFile.js'
// Helper function to validate service data
const validateServiceData = (data) => {
    const { name, price, estimatedDuration } = data;
    
    if (!name || !price || !estimatedDuration) {
        throw new ApiError(400, 'Name, price, and estimated duration are required');
    }
    
    if (price < 0) {
        throw new ApiError(400, 'Price cannot be negative');
    }
    
    if (estimatedDuration < 15) {
        throw new ApiError(400, 'Estimated duration must be at least 15 minutes');
    }
};

// Create a new service
const createService = asyncHandler(async (req, res) => {
    let imageUrl = '';
    let service;
    
    try {
        const { name, description, price, estimatedDuration, category } = req.body;
        
        // Validate required fields
        validateServiceData({ name, price, estimatedDuration });
        
        // Check if service with same name already exists
        const existingService = await Service.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') } 
        });
        
        if (existingService) {
            throw new ApiError(400, 'Service with this name already exists');
        }
        
        // Handle image upload if present
        if (req.file) {
            try {
                const image = await uploadOnCloudinary(req.file.path);
                if (image) {
                    imageUrl = image.url;
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                throw new ApiError(500, 'Failed to upload service image');
            } finally {
                // Always clean up the temp file after upload attempt
                cleanupTempFile(req.file.path);
            }
        }
        
        // Create new service
        service = await Service.create({
            name,
            description: description || '',
            price: Number(price),
            estimatedDuration: Number(estimatedDuration),
            category: category || 'Other',
            image: imageUrl,
            isActive: true
        });

        if (!service) {
            throw new ApiError(500, 'Failed to create service');
        }
        
        return res.status(201).json(
            new ApiResponse(201, service, 'Service created successfully')
        );
        
    } catch (error) {
        // Cleanup uploaded image if service creation fails
        if (imageUrl) {
            try {
                await deleteFromCloudinary(imageUrl);
            } catch (cleanupError) {
                console.error('Error cleaning up cloudinary image:', cleanupError);
            }
        }
        
        // Cleanup temp file if exists and not already cleaned up
        if (req?.file?.path) {
            cleanupTempFile(req.file.path);
        }
        
        // Re-throw the original error
        throw error;
    }
});

// Get all active services
const getServices = asyncHandler(async (req, res) => {
    const { category, search } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    // Filter by category if provided
    if (category) {
        query.category = category;
    }
    
    // Search in name or description if search term provided
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }
    
    const services = await Service.find(query)
        .select('-__v -createdAt -updatedAt -isActive')
        .sort({ category: 1, name: 1 });
    
    return res.status(200).json(
        new ApiResponse(200, services, 'Services fetched successfully')
    );
});

// Get service by ID
const getServiceById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const service = await Service.findOne({ _id: id, isActive: true })
        .select('-__v -createdAt -updatedAt -isActive');
    
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    return res.status(200).json(
        new ApiResponse(200, service, 'Service fetched successfully')
    );
});

// Update service by ID
const updateService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    let newImageUrl = null;
    let oldImageUrl = null;
    
    try {
        // Find the service
        const service = await Service.findById(id);
        if (!service || !service.isActive) {
            throw new ApiError(404, 'Service not found');
        }
        
        // Store old image URL for cleanup if needed
        oldImageUrl = service.image;
        
        // Validate updates
        if (updates.name) {
            // Check if name is already taken by another service
            const existingService = await Service.findOne({
                _id: { $ne: id },
                name: { $regex: new RegExp(`^${updates.name}$`, 'i') }
            });
            
            if (existingService) {
                throw new ApiError(400, 'Service with this name already exists');
            }
        }
        
        if (updates.price !== undefined) {
            updates.price = Number(updates.price);
            if (isNaN(updates.price) || updates.price < 0) {
                throw new ApiError(400, 'Invalid price');
            }
        }
        
        if (updates.estimatedDuration !== undefined) {
            updates.estimatedDuration = Number(updates.estimatedDuration);
            if (isNaN(updates.estimatedDuration) || updates.estimatedDuration < 15) {
                throw new ApiError(400, 'Estimated duration must be at least 15 minutes');
            }
        }
        
        // Handle image upload if present
        if (req.file) {
            try {
                const image = await uploadOnCloudinary(req.file.path);
                if (image) {
                    newImageUrl = image.url;
                    updates.image = newImageUrl;
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                throw new ApiError(500, 'Failed to upload service image');
            } finally {
                // Always clean up the temp file after upload attempt
                cleanupTempFile(req.file.path);
            }
        }
        
        // Update service
        Object.assign(service, updates);
        await service.save();
        
        // If new image was uploaded successfully, delete the old one
        if (newImageUrl && oldImageUrl) {
            try {
                await deleteFromCloudinary(oldImageUrl);
            } catch (error) {
                console.error('Error deleting old image from cloudinary:', error);
                // Don't fail the request if image deletion fails
            }
        }
        
        // Remove sensitive fields before sending response
        const updatedService = service.toObject();
        delete updatedService.__v;
        delete updatedService.createdAt;
        delete updatedService.updatedAt;
        delete updatedService.isActive;
        
        return res.status(200).json(
            new ApiResponse(200, updatedService, 'Service updated successfully')
        );
        
    } catch (error) {
        // Cleanup newly uploaded image if update fails
        if (newImageUrl) {
            try {
                await deleteFromCloudinary(newImageUrl);
            } catch (cleanupError) {
                console.error('Error cleaning up cloudinary image:', cleanupError);
            }
        }
        
        // Cleanup temp file if exists and not already cleaned up
        if (req?.file?.path) {
            cleanupTempFile(req.file.path);
        }
        
        // Re-throw the original error
        throw error;
    }
});

// Delete service (soft delete)
const deleteService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Find the service
    const service = await Service.findById(id);
    if (!service || !service.isActive) {
        throw new ApiError(404, 'Service not found');
    }
    
    // Check if there are any active bookings with this service
    const Booking = mongoose.model('Booking');
    const activeBookings = await Booking.countDocuments({
        'services.serviceId': id,
        status: { $nin: ['completed', 'cancelled'] }
    });
    
    if (activeBookings > 0) {
        throw new ApiError(400, 'Cannot delete service with active bookings');
    }
    
    // Soft delete by setting isActive to false
    service.isActive = false;
    await service.save();
    
    return res.status(200).json(
        new ApiResponse(200, null, 'Service deleted successfully')
    );
});

// Get unique categories
const getServiceCategories = asyncHandler(async (req, res) => {
    const categories = await Service.distinct('category', { isActive: true });
    
    return res.status(200).json(
        new ApiResponse(200, categories, 'Categories fetched successfully')
    );
});

export {
    createService,
    getServices,
    getServiceById,
    updateService,
    deleteService,
    getServiceCategories
};
