import { User } from '../models/User.model.js';
import { Subscription } from '../models/Subscription.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiErrors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import fs from 'fs';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
// Generate tokens
const generateTokens = async (user) => {
    try {
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // Save refresh token to user
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, 'Error while generating tokens');
    }
};

const setRefreshTokenCookie = (res, token) => {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
};

// Cleanup temp file
const cleanupTempFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('Error cleaning up temp file:', error);
        }
    }
};

// Authentication & Session

// Register a new user
export const registerUser = asyncHandler(async (req, res) => {
    let avatarLocalPath;
    try {
        const { name, email, phone, password, role = 'user' } = req.body;

        // Check if all required fields are provided
        if (!name || !email || !phone || !password) {
            throw new ApiError(400, 'All fields are required');
        }

        // Get uploaded file path
        if (!req.file) {
            throw new ApiError(400, 'Avatar is required');
        }
        avatarLocalPath = req.file.path;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }]
        });

        if (existingUser) {
            throw new ApiError(409, 'User with email or phone already exists');
        }

        // Upload avatar to Cloudinary
        const avatar = await uploadOnCloudinary(avatarLocalPath);
        if (!avatar) {
            throw new ApiError(400, 'Avatar upload failed');
        }

        // Create new user
        const user = await User.create({
            name,
            email,
            phone,
            password,
            role,
            registration_status: 'pending',
            avatar: avatar.url,
        });

        // Create a free subscription for the new user
        const freeSubscription = await Subscription.create({
            user: user._id,
            plan: 'free',
            subscriptionId: `free_${user._id}_${Date.now()}`,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            cancelAtPeriodEnd: false
        });

        // Link subscription to user
        user.subscription = freeSubscription._id;
        await user.save();

        // Generate tokens
        const { accessToken, refreshToken } = await generateTokens(user);

        // Set refresh token in HTTP-only cookie
        setRefreshTokenCookie(res, refreshToken);

        // Remove sensitive data before sending response
        const createdUser = await User.findById(user._id)
            .select('-password -refreshToken')
            .populate('subscription');

        if (!createdUser) {
            throw new ApiError(400, 'User creation Failed');
        }

        // Clean up the temp file after successful upload
        cleanupTempFile(avatarLocalPath);

        return res.json(
            new ApiResponse(
                201,
                {
                    user: createdUser,
                    accessToken
                },
                'User registered successfully'
            )
        );
    } catch (error) {
        // Clean up temp file in case of any error
        if (avatarLocalPath) {
            cleanupTempFile(avatarLocalPath);
        }
        throw error;
    }
});



// Login user
export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, 'Email and password are required');
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
        throw new ApiError(401, 'Invalid credentials');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid credentials');
    }

    const { accessToken, refreshToken } = await generateTokens(user);

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    };

    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, cookieOptions);
    user.last_login = new Date();
    await user.save({ validateBeforeSave: false });

    const loggedInUser = await User.findById(user._id).select('-password -refreshToken');

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,
                accessToken,
                refreshToken,
            },
            'User logged in successfully'
        )
    );
});

// Logout user
export const logoutUser = asyncHandler(async (req, res) => {
    // Clear refresh token from user document
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: { refreshToken: 1 }
        },
        {
            new: true
        }
    );
    const options = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        path: "/",
    }

    // Clear token cookie
    res.clearCookie('accessToken', options);
    res.clearCookie('refreshToken', options);

    return res
        .json(
            new ApiResponse(
                200,
                {},
                'User logged out successfully'  
            )
        );
});

// Refresh access token
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, 'Unauthorized request');
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user || user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, 'Invalid refresh token');
        }

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user);

        // Set new refresh token in HTTP-only cookie
        setRefreshTokenCookie(res, newRefreshToken);

        return res.status(200).json(
            new ApiResponse(
                200,
                { accessToken },
                'Access token refreshed successfully'
            )
        );
    } catch (error) {
        throw new ApiError(401, error?.message || 'Invalid refresh token');
    }
});

// Get current user
export const getCurrentUser = asyncHandler(async (req, res) => {

    if (!req.user) {
        return res.status(401).json(
            new ApiResponse(
                401,
                null,
                'No authenticated user found. Please log in.'
            )
        );
    }

    // Fetch fresh user data from database
    const user = await User.findById(req.user._id).select('-password -refreshToken');

    if (!user) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'User not found'
            )
        );
    }

    return res.json(
        new ApiResponse(
            200,
            user,
            'Current user fetched successfully'
        )
    );
});

//get user by Id
export const getUserById = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password -refreshToken');

    if (!user) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'User not found'
            )
        );
    }

    return res.json(
        new ApiResponse(
            200,
            user,
            'User fetched successfully'
        )
    );
});

//get all user
export const getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find().select('-password -refreshToken');

    if (!users) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'No users found'
            )
        );
    }

    return res.json(
        new ApiResponse(
            200,
            users,
            'Users fetched successfully'
        )
    );
});

//profile management 

// Update user profile
export const updateUserProfile = asyncHandler(async (req, res) => {
    const { name, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true }
    ).select('-password -refreshToken');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    return res.status(200).json(
        new ApiResponse(200, user, 'Profile updated successfully')
    );
});

// Change user password
export const changeUserPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, 'Both old and new password are required');
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const isPasswordValid = await user.comparePassword(oldPassword);
    if (!isPasswordValid) {
        throw new ApiError(400, 'Invalid old password');
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(200, {}, 'Password updated successfully')
    );
});

// Update user's main address
export const updateAddress = asyncHandler(async (req, res) => {
    const { street, city, pincode, state, country, landmark } = req.body;

    if (!street || !city || !pincode || !state || !country) {
        throw new ApiError(400, 'All fields are required');
    }

    // Validate pincode format (6 digits)
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
        throw new ApiError(400, 'PIN code must be 6 digits');
    }

    const updateData = {
        'address.street': street,
        'address.city': city,
        'address.pincode': pincode,
        'address.state': state,
        'address.country': country,
        'address.landmark': landmark,   
    };

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true }
    ).select('-password -refreshToken');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    console.log(user);

    return res.status(200).json(
        new ApiResponse(200, user, 'Address updated successfully')
    );

});

// Add a new saved address
export const addSavedAddress = asyncHandler(async (req, res) => {
    const { street, city, pincode, state, country, landmark, isDefault, tag } = req.body;

    if (!street || !city || !pincode || !state || !country || !tag) {
        throw new ApiError(400, 'All fields are required');
    }

    // Validate pincode format (6 digits)
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
        throw new ApiError(400, 'PIN code must be 6 digits');
    }

    const newAddress = {
        street,
        city,
        pincode,
        state,
        country,
        landmark,
        isDefault,
        ...(tag && { tag })
    };

    let update;

    if (isDefault) {
        // If setting as default, unset default from other addresses and add new default
        update = {
            $push: { 'saved_address': newAddress },
            $set: { 'saved_address.$[elem].isDefault': false }
        };
    } else {
        // Just add the new address as non-default
        update = { $push: { saved_address: newAddress } };
    }

    const options = {
        new: true,
        arrayFilters: isDefault ? [{ 'elem.isDefault': true }] : undefined
    };

    const user = await User.findByIdAndUpdate(
        req.user._id,
        update,
        options
    ).select('-password -refreshToken');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    return res.status(200).json(
        new ApiResponse(200, user, 'Address added successfully')
    );
});

// Get user saved addresses
export const getUserSavedAddresses = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('-password -refreshToken');

    if (!user) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'User not found'
            )
        );
    }

    return res.json(
        new ApiResponse(
            200,
            user.saved_address,
            'User saved addresses fetched successfully'
        )
    );
});

// Get user saved address by ID
export const getUserSavedAddressById = asyncHandler(async (req, res) => {
    const { addressId } = req.params;

    const user = await User.findById(req.user._id).select('-password -refreshToken');

    if (!user) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'User not found'
            )
        );
    }

    const address = user.saved_address.find((address) => address._id.toString() === addressId);

    if (!address) {
        return res.status(404).json(
            new ApiResponse(
                404,
                null,
                'Address not found'
            )
        );
    }

    return res.json(
        new ApiResponse(
            200,
            address,
            'User saved address fetched successfully'
        )
    );
});

// Remove a saved address
export const removeSavedAddress = asyncHandler(async (req, res) => {
    const { addressId } = req.params;

    if (!addressId) {
        throw new ApiError(400, 'Address ID is required');
    }

    // First, find the user and the address to be removed
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    // Find the address to check if it's the default
    const addressToRemove = user.saved_address.find(
        addr => addr._id.toString() === addressId
    );

    if (!addressToRemove) {
        throw new ApiError(404, 'Address not found');
    }

    const wasDefault = addressToRemove.isDefault;

    // Remove the address
    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $pull: { saved_address: { _id: addressId } } },
        { new: true }
    ).select('-password -refreshToken');

    // If the removed address was default and there are other addresses, set the first one as default
    if (wasDefault && updatedUser.saved_address.length > 0) {
        await User.findByIdAndUpdate(
            req.user._id,
            { $set: { 'saved_address.0.isDefault': true } }
        );

        // Refetch the user to get the updated data
        const finalUser = await User.findById(req.user._id).select('-password -refreshToken');
        return res.status(200).json(
            new ApiResponse(200, finalUser, 'Address removed and new default set successfully')
        );
    }

    return res.status(200).json(
        new ApiResponse(200, updatedUser, 'Address removed successfully')
    );
});

// Upload/update user avatar
export const uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, 'Avatar file is required');
    }

    const avatarLocalPath = req.file.path;

    try {
        // Upload to Cloudinary
        const avatar = await uploadOnCloudinary(avatarLocalPath);
        if (!avatar) {
            throw new ApiError(400, 'Avatar upload failed');
        }

        // Update user's avatar
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { avatar: avatar.url } },
            { new: true }
        ).select('-password -refreshToken');

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        return res.status(200).json(
            new ApiResponse(200, user, 'Avatar updated successfully')
        );
    } catch (error) {
        throw error;
    } finally {
        // Clean up temp file
        cleanupTempFile(avatarLocalPath);
    }
});

// Subscription Management

// Get user subscription details
export const getSubscriptionDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('subscription');

    if (!user) {
        throw new ApiError(401, 'User not found');
    }

    if (!user.subscription) {
        // This should theoretically never happen since we create a subscription on registration
        // but keeping this as a fallback
        const existingSubscription = await Subscription.findOne({ user: user._id });

        if (existingSubscription) {
            user.subscription = existingSubscription._id;
            await user.save();
            return res.status(200).json(
                new ApiResponse(200, existingSubscription, 'Subscription details retrieved successfully')
            );
        }

        // If still no subscription exists (shouldn't happen), create one
        const freeSubscription = await Subscription.create({
            user: user._id,
            plan: 'free',
            subscriptionId: `${plan}_${user._id}_${Date.now()}`,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            cancelAtPeriodEnd: false
        });

        user.subscription = freeSubscription._id;
        await user.save();

        return res.status(200).json(
            new ApiResponse(200, freeSubscription, 'Free subscription created successfully')
        );
    }

    res.status(200).json(
        new ApiResponse(200, user.subscription, 'Subscription details fetched successfully')
    );
});

// Update user subscription
export const updateSubscription = asyncHandler(async (req, res) => {
    const { subscriptionId, plan } = req.body;

    if (!subscriptionId || !plan) {
        throw new ApiError(400, 'Subscription ID and plan are required');
    }

    // Check if user exists
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(401, 'User not found');
    }

    let subscription;

    if (user.subscription) {
        // Update existing subscription - use findOneAndUpdate with the correct options to trigger hooks
        const updateData = {
            plan,
            subscriptionId,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            cancelAtPeriodEnd: false
        };
        
        // First update the document to trigger pre-save hooks
        const sub = await Subscription.findById(user.subscription);
        Object.assign(sub, updateData);
        await sub.save();
        
        // Then get the updated document
        subscription = await Subscription.findById(user.subscription);
    } else {
        // Create new subscription
        subscription = await Subscription.create({
            user: user._id,
            plan,
            subscriptionId,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            cancelAtPeriodEnd: false
        });

        // Link subscription to user
        user.subscription = subscription._id;
        await user.save();
    }

    res.status(200).json(
        new ApiResponse(200, subscription, 'Subscription updated successfully')
    );
});

// Cancel user subscription
export const cancelSubscription = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('subscription');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    if (!user.subscription) {
        throw new ApiError(404, 'No active subscription found');
    }

    const subscription = await Subscription.findByIdAndUpdate(
        user.subscription._id,
        {
            status: 'canceled',
            cancelAtPeriodEnd: true
        },
        { new: true, runValidators: true }
    );

    res.status(200).json(
        new ApiResponse(200, subscription, 'Subscription has been canceled. It will remain active until the end of the current billing period.')
    );
});


