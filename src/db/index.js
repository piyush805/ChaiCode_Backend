import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectdb = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    console.log(
      `\nMongoDB connect !! DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (err) {
    console.log("MONGODB connection error ", err);
    process;
  }
};
export default connectdb;
