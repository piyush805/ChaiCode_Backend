export const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

/**
 * Step 1: const asyncHandler = () => {}
 * Step 2: const asyncHandler = (func) => {() => {}}
 This becomes the line below

// here wrapper function takes passing fn into the function ahead of it 
const asyncHandler = (fn) => async () => {
	try{
		await fn(req, res, next) // execute the passed function
	}
	catch(err){
		res.status(err.code || 500).json({
			success: false, 
			message : err.message
		})
	}

} 
*/
