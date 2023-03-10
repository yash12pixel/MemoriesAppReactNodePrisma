const express = require("express");
const dotenv = require("dotenv");
const {
  successResponse,
  errorResponse,
  responseWithData,
} = require("../response/response");
const ErrorMessages = require("../constants/error");
const SuccessMessages = require("../constants/messages");
const passport = require("passport");
require("../utils/passport")(passport);
dotenv.config();
const cloudinary = require("cloudinary");
const multer = require("multer");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// SET STORAGE
const storage = multer.diskStorage({
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

// file type validation
const fileType = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/jpeg") ||
    file.mimetype.startsWith("image/png")
  ) {
    cb(null, true);
  } else {
    cb(new Error("File type should be pdf/jpeg/png and 25MB only!"));
  }
};

const upload = multer({
  storage,
  fileFilter: fileType,
  limits: { fileSize: 3200000 },
});
const uploader = async (path) =>
  await cloudinary.uploader.upload(path, "memories");

router.post(
  "/createPost",
  passport.authenticate("jwt", { session: false }),
  upload.single("file"),
  async (req, res) => {
    let id = req.user.id;
    let url;

    const { title, message, creator, tags } = req.body;
    const files = req.file;
    // console.log("files", files);
    // console.log(req.body);
    try {
      if (!creator) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Creator"),
          400
        );
      } else if (!title) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Title"),
          400
        );
      } else if (!message) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Message"),
          400
        );
      } else if (!tags) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Tags"),
          400
        );
      } else if (!files) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Image-File"),
          400
        );
      } else {
        try {
          // const postMessage = await PostMessage.create({
          //   title,
          //   message,
          //   selectedFile,
          //   creator,
          //   tags,
          //   user: id,
          // });
          // await postMessage.save();

          // await User.findByIdAndUpdate(
          //   { _id: id },
          //   { $push: { posts: postMessage._id } },
          //   { new: true }
          // );

          if (files) {
            const { path } = files;
            const newPath = await uploader(path);
            url = {
              public_id: newPath.public_id,
              asset_id: newPath.asset_id,
              version_id: newPath.version_id,
              width: newPath.width,
              height: newPath.height,
              format: newPath.format,
              original_filename: newPath.original_filename,
              url: newPath.url,
            };
            // console.log("urls::", url);
            fs.unlinkSync(path);

            try {
              const createPost = await prisma.post.create({
                data: {
                  title: title,
                  message: message,
                  creator: creator,
                  selectedFile: url,
                  tags: tags,
                  userId: id,
                },
              });
              // console.log("createPost::", createPost);

              // const update = await prisma.user.update({
              //   where: {
              //     id: id,
              //   },
              //   data: {
              //     posts: createPost._id,
              //   },
              // });
              // console.log("update::", update);

              //   const users = await prisma.user.findMany({
              //     where: {
              //       id: id,
              //     },
              //     // Returns all user fields
              //     include: {
              //       posts: {
              //         select: {
              //           id: true,
              //           title: true,
              //         },
              //       },
              //     },
              //   });

              return responseWithData(
                res,
                true,

                SuccessMessages.POST.POST_CREATED_SUCCESSFULLY,
                { user: createPost },
                200
              );

              // res.status(201).json(newPostMessage);
            } catch (error) {
              console.log("Error in create post", error);

              return errorResponse(
                res,
                ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
                  "Error For Create Post",
                  error?.message
                ),
                500
              );
            }
          } else {
            return errorResponse(res, "Please attach file", 400);
          }

          // res.status(201).json(newPostMessage);
        } catch (error) {
          console.log("Error in create post", error);

          return errorResponse(
            res,
            ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
              "Error For Create Post",
              error?.message
            ),
            500
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
);

router.patch(
  "/updatePost/:id",
  passport.authenticate("jwt", { session: false }),
  upload.single("file"),
  async (req, res) => {
    const { id } = req.params;
    // console.log("update_ID::", id);
    const { title, message, creator, tags } = req.body;
    let url;
    const files = req.file;
    // console.log("file::", files);
    // console.log(req.body);
    // console.log(id);
    try {
      const isPost = await prisma.post.findFirst({
        where: {
          id: id,
        },
      });

      if (!isPost) {
        return errorResponse(res, ErrorMessages.AUTH.INVALID_ID(id), 404);
      } else {
        try {
          //   const updatedPost = await PostMessage.findByIdAndUpdate(
          //     { _id: id },
          //     {
          //       $set: {
          //         title: title,
          //         creator: creator,
          //         message: message,
          //         tags: tags,
          //         selectedFile: selectedFile,
          //       },
          //     },
          //     { new: true }
          //   );

          if (files) {
            const post_public_id = isPost.selectedFile.public_id;
            const delCloud = await cloudinary.v2.uploader.destroy(
              post_public_id,
              (error, result) => {
                console.log("result update---", result);

                if (error) {
                  console.log(
                    "error delete file on cloud while update---",
                    error
                  );
                  return errorResponse(res, "error while deleting file!", 400);
                }
              }
            );
            if (delCloud.result === "not found") {
              return errorResponse(res, "File not found/Already deleted", 400);
            }
            const { path } = files;
            const newPath = await uploader(path);
            url = {
              public_id: newPath.public_id,
              asset_id: newPath.asset_id,
              version_id: newPath.version_id,
              width: newPath.width,
              height: newPath.height,
              format: newPath.format,
              original_filename: newPath.original_filename,
              url: newPath.url,
            };
            // console.log("urls::", url);
            fs.unlinkSync(path);
            try {
              const updatedPost = await prisma.post.update({
                where: {
                  id: id,
                },
                data: {
                  title: title,
                  message: message,
                  creator: creator,
                  selectedFile: url,
                  tags: tags,
                },
              });
              //   console.log("update post file::", updatedPost);
              return responseWithData(
                res,
                true,
                SuccessMessages.POST.POST_UPDATED_SUCCESSFULLY,
                { post: updatedPost },
                200
              );
            } catch (error) {
              console.log("error", error);
              return errorResponse(
                res,
                ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
                  "Post Update",
                  error?.message
                ),
                500
              );
            }
          } else {
            try {
              const updatedPost = await prisma.post.update({
                where: {
                  id: id,
                },
                data: {
                  title: title,
                  message: message,
                  creator: creator,
                  tags: tags,
                },
              });
              //   console.log("update post::", updatedPost);
              return responseWithData(
                res,
                true,
                SuccessMessages.POST.POST_UPDATED_SUCCESSFULLY,
                { post: updatedPost },
                200
              );
            } catch (error) {
              console.log("error", error);
              return errorResponse(
                res,
                ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
                  "Post Update",
                  error?.message
                ),
                500
              );
            }
          }
        } catch (error) {
          console.log("errorr 2", error);
          return errorResponse(
            res,
            ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
              "Post Update",
              error?.message
            ),
            500
          );
        }
      }

      // const updatedPost = {
      //   ...req.body,
      //   creator,
      //   title,
      //   message,
      //   tags,
      //   selectedFile,
      //   _id: id,
      // };
    } catch (error) {
      console.log(error);
    }
  }
);

router.delete(
  "/deletePost/:id",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const { id } = req.params;
    let user = req.user;
    try {
      const isPost = await prisma.post.findFirst({
        where: {
          id: id,
        },
      });

      if (!isPost) {
        return errorResponse(res, ErrorMessages.AUTH.INVALID_ID(id), 404);
      } else {
        try {
          await prisma.post.delete({
            where: {
              id: id,
            },
          });

          const delCloud = await cloudinary.v2.uploader.destroy(
            isPost.selectedFile.public_id,
            (error, result) => {
              console.log("result---", result);

              if (error) {
                console.log("error delete file on cloud---", error);
                return errorResponse(res, "error while deleting file!", 400);
              }
            }
          );

          if (delCloud.result === "not found") {
            return errorResponse(res, "File not found/Already deleted", 400);
          }

          const updateUser = await prisma.user.findMany({
            where: {
              id: user.id,
            },
            include: {
              posts: {
                select: {
                  title: true,
                  message: true,
                  creator: true,
                  tags: true,
                  likeCount: true,
                  selectedFile: true,
                },
              },
            },
          });
          //   const findUser = await User.findOne({ _id: id });
          //   const updatePosts = findUser.posts.filter((posts) => {
          //     return posts != post_id;
          //   });

          //   const updateUser = await User.findOneAndUpdate(
          //     { _id: id },
          //     { $set: { posts: updatePosts } }
          //   ).populate("posts");
          // res.status(201).json({ message: "Post deleted successfully." });
          return responseWithData(
            res,
            true,
            SuccessMessages.POST.POST_DELETED_SUCCESSFULLY,
            { user: updateUser },
            200
          );
        } catch (error) {
          // res.status(409).json({ message: error });
          return errorResponse(
            res,
            ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
              "Post Delete",
              error?.message
            ),
            500
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
);

router.patch(
  "/likePost/:id",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const { id } = req.params;
    try {
      const isPost = await prisma.post.findFirst({
        where: {
          id: id,
        },
      });

      if (!isPost) {
        return errorResponse(res, ErrorMessages.AUTH.INVALID_ID(id), 404);
      } else {
        try {
          //   const updatedPost = await PostMessage.findByIdAndUpdate(
          //     id,
          //     { likeCount: isPost.likeCount + 1 },
          //     { new: true }
          //   );

          const updatedPost = await prisma.post.update({
            where: {
              id: id,
            },
            data: {
              likeCount: isPost.likeCount + 1,
            },
          });

          // res.status(201).json(updatedPost);
          return responseWithData(
            res,
            true,
            SuccessMessages.POST.POST_UPDATED_SUCCESSFULLY,
            { post: updatedPost },
            200
          );
        } catch (error) {
          return errorResponse(
            res,
            ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
              "Post Update like",
              error?.message
            ),
            500
          );
        }
      }

      // const post = await PostMessage.findById(id);
    } catch (error) {
      console.log(error);
    }
  }
);

router.get(
  "/getPostsByUser",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    let id = req.user.id;

    try {
      //   const isValidUser = await prisma.user.findFirst({
      //     where: {
      //       id: id,
      //     },
      //   });

      //   if (!isValidUser) {
      //     return errorResponse(res, ErrorMessages.AUTH.INVALID_ID(id), 404);
      //   }

      //   else {
      try {
        const userByPost = await prisma.user.findMany({
          where: {
            id: id,
          },
          include: {
            posts: {
              select: {
                id: true,
                title: true,
                message: true,
                creator: true,
                tags: true,
                likeCount: true,
                selectedFile: true,
              },
            },
          },
        });

        // const postMessages = await PostMessage.find();

        // res.status(200).json(postMessages);
        return responseWithData(
          res,
          true,
          SuccessMessages.POST.POST,
          { post: userByPost },
          200
        );
      } catch (error) {
        console.log(error);
      }
      //   }
    } catch (error) {
      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Post Fetch",
          error?.message
        ),
        500
      );
    }
  }
);

router.get(
  "/getPost/:id",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const { id } = req.params;

    try {
      // const post = await PostMessage.findById(id);

      const isValidPostId = await prisma.post.findFirst({
        where: {
          id: id,
        },
      });

      if (!isValidPostId) {
        return errorResponse(res, ErrorMessages.AUTH.INVALID_ID(id), 404);
      }

      //   const post = await prisma.post.findFirst({
      //     where: {
      //       id: id,
      //     },
      //   });

      // res.status(200).json(post);
      return responseWithData(
        res,
        true,
        SuccessMessages.POST.POST,
        {
          post: isValidPostId,
        },
        200
      );
    } catch (error) {
      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Post Detail",
          error?.message
        ),
        500
      );
    }
  }
);

module.exports = router;
