const asyncHandler = (requestHandler) => async (req, res, next) => {
    try {
        await requestHandler(req, res, next);
    } catch (error) {

        // Handle MongoDB Duplicate Key Error (11000)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const message = field === "email" ? "Email already exists." : "Username already exists.";
            return res.status(400).json({
                success: false,
                message: message,
            });
        }

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

export { asyncHandler };