import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "16kb", // limit the size of json
  })
);
app.use(express.urlencoded({ extended: true, limit: "16kb" })); // extended for nested objects
app.use(express.static("public")); //some assets to be publicly accessible eg favicon, images
app.use(cookieParser()); // CRUD operation for cookies to be performed securly by server only - on the client browser

/**  middle ware for checking things before handling requests
  eg: check for logged in, check for admin
  There is a certaoin sequence to writing theese
*/
/**  Request callback actually has 4 params -> err, req, res, next
 * When using next it is assumed that it is middleware
 * Each middleware passes 'next' flag to next function
 * Finally controller discards the flag and send response directly
 */

//routes import
import userRouter from "./routes/user.routes.js";

// routes declaration
app.use("/api/v1/users", userRouter);

export { app };
