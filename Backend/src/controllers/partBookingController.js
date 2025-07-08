import asyncHandler from 'express-async-handler';
import  {Booking}  from '../models/Booking.model.js';
import  Part  from '../models/Part.model.js';

// @desc    Add parts to a booking
// @route   POST /api/bookings/:id/parts
// @access  Private/Technician
const addPartsToBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { parts } = req.body; // Array of { partId, quantity }
    
    if (!Array.isArray(parts) || parts.length === 0) {
        res.status(400);
        throw new Error('Please provide at least one part with quantity');
    }

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
        res.status(404);
        throw new Error('Booking not found');
    }

    // Check if booking is in progress
    if (booking.status !== 'in-progress') {
        res.status(400);
        throw new Error('Parts can only be added to bookings in progress');
    }

    // Process each part
    let totalPartsAmount = booking.partsAmount || 0;
    const updatedParts = [...booking.parts];
    
    for (const item of parts) {
        const { partId, quantity } = item;
        
        // Find the part
        const part = await Part.findById(partId);
        if (!part) {
            res.status(404);
            throw new Error(`Part not found: ${partId}`);
        }

        // Check if part is already in booking
        const existingPartIndex = updatedParts.findIndex(p => p.part.toString() === partId);
        
        if (existingPartIndex > -1) {
            // Update quantity if part already exists
            updatedParts[existingPartIndex].quantity += quantity;
        } else {
            // Add new part
            updatedParts.push({
                part: part._id,
                name: part.name,
                price: part.price,
                quantity
            });
        }
        
        // Update total parts amount
        totalPartsAmount += part.price * quantity;
    }

    // Update the booking
    booking.parts = updatedParts;
    booking.partsAmount = totalPartsAmount;
    booking.totalAmount = (booking.services.reduce((sum, service) => sum + service.price, 0) + totalPartsAmount) - (booking.discount?.amount || 0);
    
    // Add activity log
    booking.activities.push({
        type: 'parts_added',
        description: 'Parts added to the booking',
        performedBy: req.user._id,
        details: {
            parts: parts.map(p => ({
                partId: p.partId,
                quantity: p.quantity
            }))
        }
    });

    await booking.save();

    res.status(200).json({
        success: true,
        data: booking,
        message: 'Parts added successfully'
    });
});

// @desc    Remove parts from a booking
// @route   DELETE /api/bookings/:id/parts/:partId
// @access  Private/Technician
const removePartFromBooking = asyncHandler(async (req, res) => {
    const { id, partId } = req.params;
    const { quantity } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
        res.status(404);
        throw new Error('Booking not found');
    }

    // Check if booking is in progress
    if (booking.status !== 'in-progress') {
        res.status(400);
        throw new Error('Parts can only be modified in bookings that are in progress');
    }

    const partIndex = booking.parts.findIndex(p => p.part.toString() === partId);
    if (partIndex === -1) {
        res.status(404);
        throw new Error('Part not found in this booking');
    }

    const part = booking.parts[partIndex];
    let updatedParts = [...booking.parts];
    let totalPartsAmount = booking.partsAmount;

    if (quantity && quantity < part.quantity) {
        // Reduce quantity
        const quantityToRemove = Math.min(quantity, part.quantity);
        updatedParts[partIndex].quantity -= quantityToRemove;
        totalPartsAmount -= part.price * quantityToRemove;
        
        // Remove the part if quantity becomes zero
        if (updatedParts[partIndex].quantity === 0) {
            updatedParts = updatedParts.filter((_, index) => index !== partIndex);
        }
    } else {
        // Remove the part completely
        totalPartsAmount -= part.price * part.quantity;
        updatedParts = updatedParts.filter((_, index) => index !== partIndex);
    }

    // Update the booking
    booking.parts = updatedParts;
    booking.partsAmount = totalPartsAmount;
    booking.totalAmount = (booking.services.reduce((sum, service) => sum + service.price, 0) + totalPartsAmount) - (booking.discount?.amount || 0);
    
    // Add activity log
    booking.activities.push({
        type: 'parts_removed',
        description: 'Parts removed from the booking',
        performedBy: req.user._id,
        details: {
            partId,
            quantity: quantity || 'all'
        }
    });

    await booking.save();

    res.status(200).json({
        success: true,
        data: booking,
        message: 'Part removed successfully'
    });
});

export {
    addPartsToBooking,
    removePartFromBooking
};
