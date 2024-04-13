import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";
import connectdb from "./db/index.js";
// require('dotenv').config({path:'/env'})
import dotenv from "dotenv";
import { app } from "./app.js";

dotenv.config({
  path: "./env",
});

connectdb()
  .then(() => {
    app.on("err", (error) => {
      console.log("ERR", err);
      throw error;
    });
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running at port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log("MONGO db connection failed !!!", err);
  });

/** 
import express from 'express';
const app = express();
  
// Connect to DB using IIFE
// starting from semicolon because earlier line may not have it  
;( async() => {
  try {
    await mongoose.connect(`${process.env.MONGO_URI}/${DB_NAME}`);
    app.on("err", (error) => {
      console.log("ERR", err);
      throw error;
    })
    app.listen(process.env.PORT, () => {
      console.log(`App is listening on port ${process.env.PORT}`);
    })
  } catch (err) {
    console.log("ERROR: ", err);
    throw err;
  }
})()
*/
