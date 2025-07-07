import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { ApiError } from './ApiErrors.js';

// Configure Cloudinary with environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file to Cloudinary
 * @param {string} localFilePath - Path to the local file
 * @param {string} folder - Folder in Cloudinary where the file should be uploaded
 * @param {number} height - Optional height for image resizing
 * @param {number} quality - Optional quality for image compression (1-100)
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export const uploadOnCloudinary = async (localFilePath, folder = 'meadow_go_repair', height, quality) => {
    try {
        if (!localFilePath) {
            throw new ApiError(400, 'Local file path is required');
        }

        // Check if file exists
        if (!fs.existsSync(localFilePath)) {
            throw new ApiError(404, 'File not found');
        }

        // Upload options
        const options = {
            folder: folder,
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true,
            overwrite: true,
        };

        // Add height and quality if provided
        if (height) options.height = height;
        if (quality) options.quality = quality;

        // Upload file to Cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, options);

        // Remove the locally saved temporary file
        fs.unlinkSync(localFilePath);

        return response;
    } catch (error) {
        // Remove the locally saved temporary file as the upload operation failed
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        console.error('Error uploading to Cloudinary:', error);
        throw new ApiError(500, error?.message || 'Error uploading file to Cloudinary');
    }
};

/**
 * Deletes a file from Cloudinary
 * @param {string} publicId - The public ID of the file on Cloudinary
 * @param {string} resourceType - Type of the resource (image, video, raw, etc.)
 * @returns {Promise<Object>} - Cloudinary deletion result
 */
export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
    try {
        if (!publicId) {
            throw new ApiError(400, 'Public ID is required');
        }

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true
        });

        if (result.result !== 'ok') {
            throw new ApiError(500, 'Failed to delete file from Cloudinary');
        }

        return result;
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        throw new ApiError(500, error?.message || 'Error deleting file from Cloudinary');
    } finally {
        // Remove the locally saved temporary file
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
    }
};

// Export Cloudinary instance in case it's needed elsewhere
export { cloudinary };
