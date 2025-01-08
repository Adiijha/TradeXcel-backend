import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true, // Ensures no two users have the same phone number
    validate: {
      validator: function (v) {
        return /\+?[1-9]\d{1,14}$/.test(v); // Simple phone number validation (e.g., +1234567890)
      },
      message: props => `${props.value} is not a valid phone number!`,
    },
  },
  
  countryCode: { 
    type: String, 
    required: true 
  },

  otp: { 
    type: String,
    required: true,
  },
  otpExpiry: { 
    type: Date,
  },
  otpVerified: {
    type: Boolean,
    default: false
  },
  dob: {
    type: Date,
    required: true,
  },
  pin: {
    type: String,
    required: true,
  }
}, { timestamps: true });

// Pre-save hook to hash password before saving
userSchema.pre("save", async function(next) {
  // Only hash password if it is modified
  if (!this.isModified("password")) return next();

  // Hash the password using bcrypt
  const hashedPassword = await bcrypt.hash(this.password, 10);
  console.log("Hashed Password: ", hashedPassword);

  this.password = hashedPassword; // Replace the plain password with the hashed password

  // Proceed to save the user
  next();
});

// Method to check if entered password matches the hashed password
userSchema.methods.isPasswordCorrect = async function(password) {
  return bcrypt.compare(password, this.password); // Compare entered password with hashed password
};

userSchema.methods.isPinCorrect = async function(pin) {
  return pin === this.pin; // Compare entered pin with hashed pin
};


userSchema.methods.generateAccessToken = function () {
  return jwt.sign({
      _id: this._id,
      username: this.username,
      email: this.email,
      name: this.name,
      phoneNumber: this.phoneNumber, // Including phone number in JWT
  }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({
      _id: this._id,
  }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });
};


// Create and export the User model
export const User = mongoose.model("User", userSchema);
