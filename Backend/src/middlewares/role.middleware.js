import { ApiError } from '../utils/ApiErrors.js';

/**
 * Middleware to check if user has admin or manager role
 */
export const isAdminOrManager = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'manager')) {
        throw new ApiError(403, 'Access denied. Admin or manager privileges required.');
    }
    next();
};
export const isAdminOrPartner = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'partner')) {
        throw new ApiError(403, 'Access denied. Admin or partner privileges required.');
    }
    next();
};

/**
 * Middleware to check if user has technician role
 */
export const isTechnician = (req, res, next) => {
    if (!req.user || req.user.role !== 'technician') {
        throw new ApiError(403, 'Access denied. Technician privileges required.');
    }
    next();
};

/**
 * Middleware to check if user has specific role(s)
 * @param {...string} roles - Roles that are allowed to access the route
 */
export const hasRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new ApiError(403, `Access denied. Required roles: ${roles.join(', ')}`);
        }
        next();
    };
};

/**
 * Middleware to check if user is the owner of the resource or has admin/manager role
 * @param {string} modelName - Name of the model to check ownership
 * @param {string} [idParam='id'] - Name of the parameter containing the resource ID
 */
export const isOwnerOrAdmin = (modelName, idParam = 'id') => {
    return async (req, res, next) => {
        try {
            // Allow admins and managers to bypass ownership check
            if (req.user.role === 'admin' || req.user.role === 'manager') {
                return next();
            }

            const Model = (await import(`../models/${modelName}.model.js`)).default;
            const resource = await Model.findById(req.params[idParam]);

            if (!resource) {
                throw new ApiError(404, 'Resource not found');
            }

            // Check if the user is the owner of the resource
            if (resource.user && resource.user.toString() !== req.user._id.toString()) {
                throw new ApiError(403, 'Access denied. You are not the owner of this resource.');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};
