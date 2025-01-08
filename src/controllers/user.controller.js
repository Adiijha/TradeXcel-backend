import { asyncHandler } from "../utils/asyncHandler.js"; 
import { ApiError } from "../utils/ApiError.js";         
import { User } from "../models/user.models.js";
import { PendingUser } from "../models/pendingUsers.models.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import twilio from "twilio"; 
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { google } from "googleapis";

dotenv.config();

//Email Configuration
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, 
  process.env.GOOGLE_CLIENT_SECRET, 
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const { token } = await oAuth2Client.getAccessToken();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
        user: process.env.GOOGLE_GMAIL_ID,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: token,
  }
});

// Utility function to generate tokens
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const accessToken = user.generateAccessToken();  // Ensure this method exists and works
    const refreshToken = user.generateRefreshToken();  // Ensure this method exists and works

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error generating tokens:", error);
    throw new ApiError(500, "Error generating tokens");
  }
};

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized Request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user= await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(404, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or used")
        }
        
        const options = {
            httpOnly : true,
            secure : true
        }
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken",accessToken , options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(200,{
                accessToken, refreshToken :newRefreshToken
            },"Access Token refreshed successfully")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

// User Login
const loginUser = asyncHandler(async (req, res) => {
  const { emailOrUsername, password, pin } = req.body;
  console.log("Login Request:", req.body);
  
  if (!emailOrUsername || !password || !pin) {
    throw new ApiError(400, "Email or Username, Password, and PIN are required");
  }


  const user = await User.findOne({
    $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
  });


  if (!user) {
    res.status(404).json({ message: "User not found" });
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    res.status(401).json({ message: "Invalid credentials" });
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.pin !== pin) {
    res.status(403).json({ message: "Invalid PIN" });
    throw new ApiError(403, "Invalid PIN");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken -pin");

  const options = {
    httpOnly: true,
  secure: false,
  sameSite: "none", // Cross-origin cookies
  path: "/",
  expires: new Date(Date.now() + 3600000),
  };

  res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json({
      status: 200,
      data: { user: loggedInUser, accessToken, refreshToken },
      message: "User logged in successfully"
    });

});

// User Logout
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true, // Set to true in production
    sameSite: "strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

// Generate OTP and expiry
const generateOTP = async (contact, otpMethod, countryCode) => {
  const otp = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP expiry: 10 minutes

  if (otpMethod === "email") {
    // Send OTP via email
    await sendOTP(contact, null, otpMethod, otp); // Pass email as the first parameter
  } else if (otpMethod === "phone") {
    // Send OTP via phone
    await sendOTP(null, contact, otpMethod, otp, countryCode); // Pass phoneNumber and countryCode
  } else {
    throw new Error("Invalid OTP method");
  }

  return { otp, otpExpiry };
};

// Utility function to send OTP via email or SMS
const sendOTP = async (email, phoneNumber, otpMethod, otp, countryCode) => {
  if (otpMethod === "email") {
    // Ensure email is provided for email-based OTP
    if (!email) {
      throw new ApiError(400, "Email is required for OTP method 'email'");
    }

    const mailOptions = {
      from: process.env.GOOGLE_GMAIL_ID,
      to: email, // Use email directly
      subject: "Welcome to TradeXcel",
      html : `<h3>Your OTP Code for TradeXcel Registration is <b>${otp}</b>. It is valid for 10 minutes.</h3>`,
      text: `Your OTP Code for TradeXcel Registration is ${otp}. It is valid for 10 minutes.`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent: ", info.response);
    } catch (error) {
      console.error("Error sending OTP via email:", error);
      throw new ApiError(500, "Error sending OTP via email");
    }
  } 
  
  else if (otpMethod === "phone") {
    // Ensure phone number and country code are provided for SMS-based OTP
    if (!phoneNumber || !countryCode) {
      throw new ApiError(400, "Phone number and country code are required for OTP method 'phone'");
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    try {
      await client.messages.create({
        body: `Your OTP for TradeXcel Registration is ${otp}. It is valid for 10 minutes.`,
        to: `${countryCode}${phoneNumber}`, // Format phone number with country code
        from: process.env.TWILIO_PHONE_NUMBER,
      });
    } catch (error) {
      console.error("Error sending OTP via SMS:", error);
      throw new ApiError(500, "Error sending OTP via SMS");
    }
  } else {
    throw new ApiError(400, "Invalid OTP method");
  }
};

// User Registration
const registerUser = asyncHandler(async (req, res) => {
  const { name, username, email, password, dob, phoneNumber, countryCode, pin, otpMethod } = req.body;

  // Validate required fields
  if (!name || !username || !email || !password || !dob || !phoneNumber || !countryCode || !pin || !otpMethod) {
    throw new ApiError(400, "All fields are required.");
  }

  // Validate OTP method
  if (!["email", "phone"].includes(otpMethod)) {
    throw new ApiError(400, "Invalid OTP method.");
  }

  // Check if user already exists
  const existingUser = await User.findOne({ 
    $or: [
      { email }, 
      { phoneNumber, countryCode }, 
      { username },
    ] 
  });

  if (existingUser) {
    throw new ApiError(400, "Email, phone number, or username is already registered.");
  }

  // Generate OTP
  const { otp, otpExpiry } = await generateOTP(
    otpMethod === "email" ? email : phoneNumber,
    otpMethod,
    countryCode
  );

  // Save PendingUser
  const pendingUser = new PendingUser({
    name,
    username,
    email,
    password,
    dob,
    phoneNumber,
    countryCode,
    otp,
    otpExpiry,
    otpMethod,
    otpVerified: false,
    pin,
  });

  await pendingUser.save();

  res.status(200).json({
    message: "User registered successfully. Please verify the OTP.",
  });
});

const verifyOTP = asyncHandler(async (req, res) => {
  const { email, phoneNumber, otp, otpMethod } = req.body;

  // Ensure required fields are present
  if (!otpMethod || !otp) {
    throw new ApiError(400, "OTP method and OTP are required.");
  }

  if (otpMethod === "email" && !email) {
    throw new ApiError(400, "Email is required for email OTP method.");
  }
  if (otpMethod === "phone" && !phoneNumber) {
    throw new ApiError(400, "Phone number is required for phone OTP method.");
  }

  // Look for the pending user based on contact method
  let pendingUser;
  if (otpMethod === "email") {
    pendingUser = await PendingUser.findOne({ email });
  } else if (otpMethod === "phone") {
    pendingUser = await PendingUser.findOne({ phoneNumber });
  } else {
    throw new ApiError(400, "Invalid OTP method.");
  }

  console.log("Pending User OTP (from DB):", pendingUser.otp);  // Log OTP from DB
  console.log("Received OTP:", otp);  // Log OTP from request

  console.log("Pending User:", pendingUser);
  if (!pendingUser) {
    throw new ApiError(404, "No pending user found.");
  }

  // Check if OTP matches
  if (pendingUser.otp !== otp) {
    throw new ApiError(400, "Invalid OTP.");
  }

  // Check if OTP has expired
  if (Date.now() > pendingUser.otpExpiry) {
    throw new ApiError(400, "OTP has expired.");
  }

  // Mark OTP as verified
  pendingUser.otpVerified = true;
  await pendingUser.save();

  // Move user to Users collection
  const user = new User({
    name: pendingUser.name,
    username: pendingUser.username,
    email: pendingUser.email,
    password: pendingUser.password,
    dob: pendingUser.dob,
    phoneNumber: pendingUser.phoneNumber,
    countryCode: pendingUser.countryCode,
    otp: pendingUser.otp,
    otpVerified: true,
    pin: pendingUser.pin,
  });

  await user.save();
  await PendingUser.deleteOne({ _id: pendingUser._id });

  res.status(200).json({ message: "User verified and confirmed successfully. You can now log in." });
});

const getName = asyncHandler(async (req, res) => {
  // Fetching only the name field of the user by ID
  const user = await User.findById(req.user._id).select("name");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  // Return the user's name in the response
  res.status(200).json({ status: 200, data: { name: user.name } });
});

const getProfile = asyncHandler(async (req, res) => {
  // Fetching the user by ID, excluding the password and refresh token
  const user = await User.findById(req.user._id).select("-password -refreshToken -pin");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  // Return the user's profile in the response
  res.status(200).json({ status: 200, data: {name: user.name, email: user.email, phoneNumber: user.phoneNumber, username: user.username, dob: user.dob} });
});

const changeCurrentPasswordAndPin = asyncHandler(async(req,res)=>{
  const { oldPassword, newPassword, oldPin, newPin } = req.body;

  // Fetch user from the database
  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Update password if provided
  if (oldPassword || newPassword) {
    if (!oldPassword || !newPassword) {
      throw new ApiError(400, "Both oldPassword and newPassword are required to update the password");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if (!isPasswordCorrect) {
      throw new ApiError(401, "Invalid old password");
    }

    user.password = newPassword;
  }

  // Update PIN if provided
  if (oldPin || newPin) {
    if (!oldPin || !newPin) {
      throw new ApiError(400, "Both oldPin and newPin are required to update the PIN");
    }

    const isPinCorrect = await user.isPinCorrect(oldPin); // Ensure you have a method like this in your model
    if (!isPinCorrect) {
      throw new ApiError(401, "Invalid old PIN");
    }

    user.pin = newPin;
  }

  // Save user with updated fields
  await user.save({ validateBeforeSave: true });

  return res.status(200).json(
    new ApiResponse(200, {}, "Password and/or PIN changed successfully")
  );

})

const updateUser = asyncHandler(async (req, res) => {
  const { name, username, email, phoneNumber, dob } = req.body;

  // Create a dynamic update object
  const updateFields = {};
  if (name) updateFields.name = name;
  if (username) updateFields.username = username;
  if (email) updateFields.email = email;
  if (phoneNumber) updateFields.phoneNumber = phoneNumber;
  if (dob) updateFields.dob = dob;

  try {
    // Check if any fields are provided for update
    if (Object.keys(updateFields).length === 0) {
      throw new ApiError(400, "No fields provided for update");
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: updateFields,
      },
      {
        new: true, // Return the updated document
        runValidators: true, // Ensure validators are run
      }
    ).select("-password");

    // Handle case when user is not found
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Respond with success
    return res.status(200).json(
      new ApiResponse(200, user, "User details updated successfully")
    );
  } catch (error) {
    // Handle unexpected errors
    throw new ApiError(500, error.message || "Internal Server Error");
  }
});

export { registerUser, loginUser, logoutUser, verifyOTP, sendOTP, getName, updateUser, getProfile, changeCurrentPasswordAndPin, refreshAccessToken };
