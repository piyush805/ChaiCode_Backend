import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";

// since res unsed, so replaced with _ in the arg
export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    // header as well bcoz mobile app does not have cookies
    const token = req.cookies?.accessToken || req.header("Authorization");

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    const decodedTokenInfo = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedTokenInfo?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      // TODO: Discuss about frontend
      throw new ApiError(401, "Invalid Access Token");
    }
    req.user = user; // add value user to request
    next();
  } catch (err) {
    throw new ApiError(401, err?.message || "Invalid Access Token");
  }
});
