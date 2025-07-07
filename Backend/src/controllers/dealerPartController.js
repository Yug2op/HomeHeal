import { Part } from '../models/Part.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc    Create a new part (Dealer only)
// @route   POST /api/dealer/parts
// @access  Private/Dealer
const createPart = asyncHandler(async (req, res) => {
    const dealerId = req.user._id;
    const {
        name, description, price, cost, quantityInStock, minimumQuantity,
        category, brand, model, compatibleWith, image, reorderLevel
    } = req.body;

    // Check if user is a dealer
    if (req.user.role !== 'dealer') {
        throw new ApiError(403, 'Only dealers can add parts');
    }

    // Generate SKU
    const sku = `PART-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    const part = await Part.create({
        supplier: dealerId,
        sku,
        name,
        description,
        price,
        cost,
        quantityInStock: quantityInStock || 0,
        minimumQuantity: minimumQuantity || 5,
        reorderLevel: reorderLevel || 10,
        category,
        brand,
        model,
        compatibleWith: compatibleWith || [],
        image: image || '',
        supplierDetails: {
            name: req.user.name,
            contact: {
                phone: req.user.phone,
                email: req.user.email
            },
            leadTime: 3, // Default lead time in days
            address: req.user.address?.[0] || {}
        }
    });

    res.status(201).json(
        new ApiResponse(201, part, 'Part created successfully')
    );
});

// @desc    Get all parts for a dealer
// @route   GET /api/dealer/parts
// @access  Private/Dealer
const getDealerParts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search, category, inStock } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { supplier: req.user._id };
    
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }
    
    if (category) {
        query.category = category;
    }
    
    if (inStock === 'true') {
        query.quantityInStock = { $gt: 0 };
    } else if (inStock === 'false') {
        query.quantityInStock = 0;
    }
    
    const [parts, total] = await Promise.all([
        Part.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        Part.countDocuments(query)
    ]);
    
    res.status(200).json(
        new ApiResponse(200, {
            parts,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        }, 'Parts retrieved successfully')
    );
});

// @desc    Get part by ID
// @route   GET /api/dealer/parts/:id
// @access  Private/Dealer
const getPartById = asyncHandler(async (req, res) => {
    const part = await Part.findOne({
        _id: req.params.id,
        supplier: req.user._id
    });
    
    if (!part) {
        throw new ApiError(404, 'Part not found');
    }
    
    res.status(200).json(
        new ApiResponse(200, part, 'Part retrieved successfully')
    );
});

// @desc    Update a part
// @route   PUT /api/dealer/parts/:id
// @access  Private/Dealer
const updatePart = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    // Find the part and verify ownership
    const part = await Part.findOne({ _id: id, supplier: req.user._id });
    if (!part) {
        throw new ApiError(404, 'Part not found or access denied');
    }
    
    // Prevent updating certain fields
    const restrictedFields = ['supplier', 'sku', 'createdAt', 'updatedAt'];
    restrictedFields.forEach(field => delete updates[field]);
    
    // Update the part
    Object.assign(part, updates);
    await part.save();
    
    res.status(200).json(
        new ApiResponse(200, part, 'Part updated successfully')
    );
});

// @desc    Delete a part
// @route   DELETE /api/dealer/parts/:id
// @access  Private/Dealer
const deletePart = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if part exists and is owned by the dealer
    const part = await Part.findOneAndDelete({
        _id: id,
        supplier: req.user._id
    });
    
    if (!part) {
        throw new ApiError(404, 'Part not found or access denied');
    }
    
    res.status(200).json(
        new ApiResponse(200, null, 'Part deleted successfully')
    );
});

// @desc    Update part stock
// @route   PATCH /api/dealer/parts/:id/stock
// @access  Private/Dealer
const updateStock = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { quantity, action = 'add', note } = req.body;
    
    if (!['add', 'subtract', 'set'].includes(action)) {
        throw new ApiError(400, 'Invalid action. Use add, subtract, or set');
    }
    
    if (isNaN(quantity) || quantity < 0) {
        throw new ApiError(400, 'Invalid quantity');
    }
    
    const part = await Part.findOne({ _id: id, supplier: req.user._id });
    if (!part) {
        throw new ApiError(404, 'Part not found or access denied');
    }
    
    // Update stock based on action
    if (action === 'add') {
        part.quantityInStock += Number(quantity);
    } else if (action === 'subtract') {
        if (part.quantityInStock < quantity) {
            throw new ApiError(400, 'Insufficient stock');
        }
        part.quantityInStock -= Number(quantity);
    } else {
        part.quantityInStock = Number(quantity);
    }
    
    part.lastRestocked = new Date();
    
    // Add stock movement history
    part.stockHistory = part.stockHistory || [];
    part.stockHistory.push({
        date: new Date(),
        quantity: Number(quantity),
        action,
        note: note || 'Stock updated by dealer',
        updatedBy: req.user._id
    });
    
    await part.save();
    
    res.status(200).json(
        new ApiResponse(200, part, 'Stock updated successfully')
    );
});

export {
    createPart,
    getDealerParts,
    getPartById,
    updatePart,
    deletePart,
    updateStock
};
