import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false }); // since new user is not being created, only existing user updated, we dont require validation - otherwise password needs to be passed
    return { accessToken, refreshToken };
  } catch (err) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

export const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - not empty
  // check if user exists: username, email
  // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user to object - create entry in db
  // remove password from refresh token field from response
  // check for user creation
  // return response

  const { fullName, email, password, username } = req.body;
  if (
    [fullName, email, password, username].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }
  // validation methods from a separate files

  // check if user exists: username, email
  const existedUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  const avatarLocation = req.files?.avatar[0]?.path;
  let coverImageLocalPath = null;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files?.coverImage[0]?.path;
  }
  if (!avatarLocation) {
    throw new ApiError(400, "Avatar image is required");
  }
  // upload them to cloudinary, avatar
  const avatar = await uploadOnCloudinary(avatarLocation, {
    folder: "avatars",
  });
  let coverImage = null;
  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath, {
      folder: "coverImages",
    });
  }

  if (!avatar) {
    throw new ApiError(400, "Avatar image is required");
  }
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    // if cover image is not uploaded because it is not required
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });
  // remove password from refresh token field from response (negative selection)
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) {
    if (avatar) await deleteFromCloudinary(avatar.public_id);

    if (coverImage) await deleteFromCloudinary(coverImage.public_id);

    throw new ApiError(
      500,
      "Something went wrong while registering user and images were deleted"
    );
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie
  const { email, username, password } = req.body;
  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  const user = await User.findOne({ $or: [{ username }, { email }] });
  if (!user) {
    throw new ApiError(404, "user does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // make cookies server-modifiable
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          // send tokens here as well in case FE wants to save data in some storage eg: mobile-apps do not have cookies
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      // $set : {refreshToken: undefined} works
      // $set : {refreshToken: null} doesn't works
      $unset: {
        refreshToken: 1, // this removes the field from the document
      },
    },
    {
      new: true, // returns updated object
    }
  );
  // make cookies server-modifiable
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!incomingToken) {
      throw new Api(401, "Unauthorized request");
    }
    const decodedTokenInfo = await jwt.verify(
      incomingToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedTokenInfo?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    // since refresh token was saved in user as well while registering
    // so it has to be matched and validated
    if (incomingToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token expired or used");
    }

    // Generate new access and refresh token and send to user
    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user?._id);
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            newRefreshToken,
          },
          "Access token refreshed successfully"
        )
      );
  } catch (err) {
    throw new ApiError(401, err?.message) || "Invalid refresh token";
  }
});

export const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

export const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) {
    throw new ApiError(400, "All field are required");
  }
  // update the user, get new, and select it in one go
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

export const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocationPath = req.file?.path;
  if (!avatarLocationPath) {
    throw new ApiError(400, "Avatar file is missing");
  }
  const avatar = await uploadOnCloudinary(avatarLocationPath);
  if (!avatar) {
    throw new ApiError(400, "Error while uploading avatar");
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

export const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverLocationPath = req.file?.path;
  if (!coverLocationPath) {
    throw new ApiError(400, "Cover file is missing");
  }
  const coverImage = await uploadOnCloudinary(coverLocationPath);
  if (!coverImage) {
    throw new ApiError(400, "Error while uploading cover");
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

export const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }
  const channel = await User.aggregate([
    // get the channel with matching username (it is unique)
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    // check in subscription scheme where this user exists as a channel
    // match the user._id to subscriptions.channel AS `subscribers`
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    // check in subscription scheme where this user exists as a subscriber
    // match the user._id to subscriptions.subscriber AS `subscribedTo`
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    // count and add those field to the data row of this user along with other details AS `subscribersCount` AND `channelsSubscribedToCount`
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers", // dollar becoz it is field now from the previous count
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo", // dollar becoz it is field now from previous pipeline
        },
        // for checking whether current user is subscribed to requested channel
        // Channel has field `subscribers` now, which is array of all those documents from subscriptions schema
        // check if this requesting user._id matches any of those as subscriber field
        isSubscribed: {
          $cond: {
            // $in can check in both Arrays and Objects
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    // select only some data(fields) from this collection(row)
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

export const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        // normal in mongoose, _id is converted to ObjectId
        // But in aggregation pipeline it is all passed as it is so it has to be converted manually
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    // User watchHistory has Array of ObjectId of Video Schema
    {
      // SELECT all documents(rows) from Video schema whose _id exists in user's watchHistory cell []
      // this gives array of Video objects
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            // Each Video has owner field- which is ObjectId of User Schema
            // From all above videos for each, SELECT owner which matches User schema ObjectId
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  // Filter out fields of owner(user) we need with each user - and project it here itself
                  // This can be done one level up as well i.e. after selecting entire user(owner)
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            // since lookup returns an Array - owner field of video will have Array of single user object [{owner}]
            // here we extract that object [first element of array - $first] from owner field
            // and and place it in `owner` column again
            // this makes it cleaner
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});
