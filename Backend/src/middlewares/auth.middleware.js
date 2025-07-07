import { ApiError } from '../utils/ApiErrors.js';
import { User } from '../models/User.model.js';
import jwt from 'jsonwebtoken';

export const verifyJWT = async (req, res, next) => {
    try {
        let token = req.cookies?.accessToken || 
                  req.header("Authorization")?.replace("Bearer ", "").trim();
        
        if (!token && req.cookies?.refreshToken) {
            token = req.cookies.refreshToken;
        }
        
        if (!token) {
            throw new ApiError(401, "Please log in to access this resource");
        }

        let decodedToken;
        let user;

        try {
            decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            user = await User.findById(decodedToken?._id).select("-password -refreshToken");
        } catch (accessTokenError) {
            if (accessTokenError.name === 'JsonWebTokenError' || accessTokenError.name === 'TokenExpiredError') {
                decodedToken = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
                user = await User.findOne({
                    _id: decodedToken?._id,
                    refreshToken: token
                }).select("-password -refreshToken");
            } else {
                throw accessTokenError;
            }
        }

        if (!user) {
            throw new ApiError(401, "Invalid or expired authentication token");
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            next(new ApiError(401, "Your session has expired. Please log in again."));
        } else if (error.name === 'JsonWebTokenError') {
            next(new ApiError(401, "Invalid authentication token"));
        } else {
            next(error);
        }
    }
};

export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            throw new ApiError(403, `Role: ${req.user?.role} is not allowed to access this resource`);
        }
        next();
    };
};
