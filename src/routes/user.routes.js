import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyOTP,
  getProfile // Import the verifyOTP controller
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public Routes
router.post("/register", registerUser); // User registration
router.post("/login", loginUser); // User login
router.post("/verify-otp", verifyOTP); // OTP verification

// Protected Routes (Require Authentication)
router.post("/logout", verifyJWT, logoutUser); // User logout (JWT-protected)

router.get("/profile", verifyJWT, getProfile); // Get user profile (JWT-protected)

export default router;
