import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyOTP,
  getName,
  updateUser,
  getProfile,
  changeCurrentPasswordAndPin,
  getAvatar,
  updateAvatar,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {upload} from "../middlewares/multer.middleware.js"

const router = Router();

// Public Routes
router.post("/register", registerUser); // User registration
router.post("/login", loginUser); // User login
router.post("/verify-otp", verifyOTP); // OTP verification

// Protected Routes (Require Authentication)
router.patch("/update", verifyJWT, updateUser); // Update user profile (JWT-protected)
router.post("/logout", verifyJWT, logoutUser); // User logout (JWT-protected)
router.get("/name", verifyJWT, getName); // Get user name (JWT-protected)
router.get("/profile", verifyJWT, getProfile); // Get user profile (JWT-protected)
router.patch("/change-password-pin", verifyJWT, changeCurrentPasswordAndPin); // Change password and pin (JWT-protected)
router.get("/getavatar", verifyJWT, getAvatar); // Get user avatar (JWT-protected)
router.patch("/updateavatar", verifyJWT, upload.single("avatar"), updateAvatar); // Update user avatar (JWT-protected)


export default router;
