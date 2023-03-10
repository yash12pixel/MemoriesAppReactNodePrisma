const express = require("express");
const dotenv = require("dotenv");
const {
  successResponse,
  errorResponse,
  responseWithData,
} = require("../response/response");
const ErrorMessages = require("../constants/error");
const SuccessMessages = require("../constants/messages");
const sendEmail = require("../utils/emailUtility");
const config = require("../config/config");
const moment = require("moment");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { hashPassword, getUtcDate, comparePassword } = require("../utils/util");
const otpGenerator = require("otp-generator");
const jwtKey = process.env.JWT_KEY;
const passport = require("passport");
require("../utils/passport")(passport);
dotenv.config();
const { PrismaClient } = require("@prisma/client");
const { email } = require("../config/config");

const prisma = new PrismaClient();
const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { firstname, lastname, password, email } = req.body;
    if (!firstname || firstname == null || firstname == undefined) {
      res.status(406).json({ message: "First Name is required" });
    } else if (!lastname || lastname == null || lastname == undefined) {
      res.status(406).json({ message: "Last name is required" });
    } else if (!password || password == null || password == undefined) {
      res.status(406).json({ message: "Password is required" });
    } else if (!email || email == null || email == undefined) {
      res.status(406).json({ message: "Email is required" });
    } else {
      const checkEmailExist = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });
      if (checkEmailExist) {
        return errorResponse(
          res,
          ErrorMessages.AUTH.VALUE_ALREADY_EXIST("Email", email),
          400
        );
      } else {
        let hash = await hashPassword(password);

        let otpNumber = otpGenerator.generate(6, {
          digits: true,
          lowerCaseAlphabets: false,
          upperCaseAlphabets: false,
          specialChars: false,
        });
        let utcDate = getUtcDate();

        let user = {
          firstName: firstname,
          lastName: lastname,
          password: hash,
          email: email,
          otpCode: otpNumber,
          otpCreateTime: utcDate,
          isOTPVerified: false,
        };

        let { delivered } = await sendEmail(
          email,
          config.email.signupSubject,
          config.email.template.emailSignupOtp(otpNumber)
        );

        if (!delivered) {
          // await session.abortTransaction()
          return errorResponse(
            res,
            ErrorMessages.AUTH.NETOWRK_PROBLEM_ERROR,
            400
          );
        } else {
          try {
            const userRegister = await prisma.user.create({
              data: user,
            });
            // console.log("register::", userRegister);

            return successResponse(
              res,
              SuccessMessages.AUTH.REGISTER_SUCCESSFULLY(email),
              200
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  } catch (error) {
    console.log("error", error);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
        "User registration",
        error?.message
      ),
      500
    );
  }
});

router.post("/verifyOtp", async (req, res) => {
  const { otpCode, email } = req.body;
  try {
    if (!otpCode || otpCode == null || otpCode == undefined) {
      res.status(406).json({ message: "Otp code is required" });
    } else if (!email || email == null || email == undefined) {
      res.status(406).json({ message: "email is required" });
    } else {
      const userRecord = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });
      if (!userRecord) {
        return errorResponse(
          res,
          ErrorMessages.AUTH.ACCOUNT_NOT_FOUND(email),
          400
        );
      } else {
        var utcMoment = moment.utc();
        var utcDate = new Date(utcMoment.format());
        var diff =
          (utcDate.getTime() - userRecord.otpCreateTime.getTime()) / 1000;
        const diffInMinute = diff / 60;

        if (userRecord.isOTPVerified === true) {
          return errorResponse(res, ErrorMessages.AUTH.ALREADY_VERIFY, 400);
        } else if (userRecord.otpCode !== otpCode) {
          return errorResponse(res, ErrorMessages.AUTH.INVALID_OTP, 400);
        } else if (diffInMinute > config.otpExpireTime) {
          return errorResponse(res, ErrorMessages.AUTH.OTP_CODE_EXPIRED, 400);
        } else {
          try {
            const userVerify = await prisma.user.update({
              where: {
                id: userRecord.id,
              },
              data: {
                isOTPVerified: true,
                otpCode: "0",
              },
            });
            //   console.log("user verify", userVerify);

            return successResponse(
              res,
              SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY(
                "User account status"
              ),
              200
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  } catch (error) {
    console.log("Error in verifyOtpToken", error);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
        "Otp Verification",
        error?.message
      ),
      500
    );
  }
});

router.post("/resendOtp", async (req, res) => {
  const { email } = req.body;
  console.log("email", email);
  try {
    if (!email || email == null || email == undefined) {
      res.status(406).json({ message: "email is required" });
    }
    const userRecord = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (!userRecord) {
      return errorResponse(
        res,
        ErrorMessages.COMMON_VALIDATION_ERROR.USER_NOT_FOUND("Email"),
        400
      );
    } else {
      if (userRecord.isOTPVerified === true) {
        return errorResponse(res, ErrorMessages.AUTH.ALREADY_VERIFY, 400);
      } else {
        let otpNumber = otpGenerator.generate(6, {
          digits: true,
          lowerCaseAlphabets: false,
          upperCaseAlphabets: false,
          specialChars: false,
        });

        let utcDate = getUtcDate();
        let { delivered } = await sendEmail(
          email,
          config.email.resendOtpSubject,
          config.email.template.resendOtp(otpNumber)
        );

        if (!delivered) {
          return errorResponse(
            res,
            ErrorMessages.AUTH.NETOWRK_PROBLEM_ERROR,
            400
          );
        } else {
          //   userRecord.otpCode = otpNumber;
          //   userRecord.otpCreateTime = utcDate;
          //   await userRecord.save();
          try {
            const resendOtpUser = await prisma.user.update({
              where: {
                id: userRecord.id,
              },
              data: {
                otpCode: otpNumber,
                otpCreateTime: utcDate,
              },
            });

            //   console.log("resend otp", resendOtpUser);

            return successResponse(
              res,
              SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY(
                "User Otp Updated"
              ),
              200
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  } catch (error) {
    // console.log("Error in resendOtpToken", error.message);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL("Resend Otp", error?.message),
      500
    );
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || email == null || email == undefined) {
      res.status(406).json({ message: "email is required" });
    } else if (!password || password == null || password == undefined) {
      res.status(406).json({ message: "password is required" });
    } else {
      const userExist = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });
      // console.log("userExist::", userExist);

      if (!userExist) {
        return errorResponse(res, "Your email is not valid", 400);
      } else {
        let id = userExist.id;
        //   let firstName = userExist.firstName;
        const passwordIsValid = bcrypt.compareSync(
          password,
          userExist.password
        );

        if (!passwordIsValid) {
          return errorResponse(res, "Your password is not valid", 400);
        } else if (userExist.isOTPVerified === false) {
          return responseWithData(
            res,
            true,
            ErrorMessages.AUTH.LOGIN_FAIL_MESSAGE,
            { accountVerified: false, email: userExist.email },
            200
          );
        } else {
          try {
            const jwtToken = jwt.sign(
              {
                email,
                id,
                userExist,
              },
              jwtKey,
              {
                expiresIn: "1d",
              }
            );

            return responseWithData(
              res,
              true,
              SuccessMessages.AUTH.LOGIN_SUCCESS_MESSAGE,
              { accessToken: jwtToken, accountVerified: true },
              200
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  } catch (error) {
    console.log("Error in login", error);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL("Login", error?.message),
      500
    );
  }
});

router.post("/forgotCredential", async (req, res) => {
  const { email } = req.body;
  try {
    if (!email || email == null || email == undefined) {
      res.status(406).json({ message: "email is required" });
    }

    const userRecord = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (!userRecord) {
      return res
        .status(400)
        .json({ error: ErrorMessages.AUTH.ACCOUNT_NOT_FOUND("Email", email) });
    } else {
      let otpNumber = otpGenerator.generate(6, {
        digits: true,
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
      });

      let utcDate = getUtcDate();

      let { delivered } = await sendEmail(
        email,
        config.email.forgotSubject,
        config.email.template.emailForgotPassword(otpNumber)
      );

      if (!delivered) {
        return errorResponse(
          res,
          ErrorMessages.AUTH.NETOWRK_PROBLEM_ERROR,
          400
        );
      } else {
        try {
          const forgotCredential = await prisma.user.update({
            where: {
              id: userRecord.id,
            },
            data: {
              otpCode: otpNumber,
              otpCreateTime: utcDate,
            },
          });

          return successResponse(
            res,
            SuccessMessages.AUTH.FOGET_PASSWORD_OTP_SEND_SUCCESSFULLY(email),
            200
          );
        } catch (error) {
          console.log(error);
        }
      }
    }

    // userRecord.otpCode = otpNumber;
    // userRecord.otpCreateTime = utcDate;
    // await userRecord.save();
  } catch (error) {
    // console.log("Error in forgotCredential", error.message);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
        "Forgot Email Send",
        error?.message
      ),
      500
    );
  }
});

router.post("/updatePassword", async (req, res) => {
  const { otpCode, password } = req.body;
  try {
    if (!otpCode || otpCode == null || otpCode == undefined) {
      res.status(406).json({ message: "Otp code is required" });
    } else if (!password || password == null || password == undefined) {
      res.status(406).json({ message: "Password is required" });
    } else {
      const userRecord = await prisma.user.findFirst({
        where: {
          otpCode: otpCode,
        },
      });
      if (!userRecord) {
        return errorResponse(res, ErrorMessages.AUTH.INVALID_OTP, 400);
      } else {
        var utcMoment = moment.utc();
        var utcDate = new Date(utcMoment.format());
        var diff =
          (utcDate.getTime() - userRecord.otpCreateTime.getTime()) / 1000;
        const diffInMinute = diff / 60;
        if (diffInMinute > config.otpExpireTime) {
          return errorResponse(res, ErrorMessages.AUTH.OTP_CODE_EXPIRED, 400);
        } else {
          let hash = await hashPassword(password);
          try {
            const updatePassword = await prisma.user.update({
              where: {
                id: userRecord.id,
              },
              data: {
                password: hash,
                otpCode: "0",
              },
            });
            return successResponse(
              res,
              SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY("password"),
              200
            );
          } catch (error) {
            console.log(error);
          }
        }

        //   userRecord.password = hash;
        //   userRecord.otpCode = 0;
        //   await userRecord.save();
      }
    }
  } catch (error) {
    // console.log("Error in updatePassword", error.message);
    return errorResponse(
      res,
      ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
        "Update password",
        error?.message
      ),
      500
    );
  }
});

router.patch(
  "/updateEmail",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const user = req.user;
    // console.log("user in user::", user);
    const { email } = req.body;
    try {
      if (!email || email == null || email == undefined) {
        res.status(406).json({ message: "Email is required" });
      } else {
        const checkEmailExist = await prisma.user.findUnique({
          where: {
            email: email,
          },
        });
        if (checkEmailExist) {
          return errorResponse(
            res,
            ErrorMessages.AUTH.VALUE_ALREADY_EXIST("email", email),
            400
          );
        } else {
          let otpNumber = otpGenerator.generate(6, {
            digits: true,
            lowerCaseAlphabets: false,
            upperCaseAlphabets: false,
            specialChars: false,
          });
          // get utc dagte
          let utcDate = getUtcDate();

          let { delivered } = await sendEmail(
            email,
            config.email.updateEmailSubject,
            config.email.template.emailSignupOtp(otpNumber)
          );

          if (!delivered) {
            return errorResponse(
              res,
              ErrorMessages.AUTH.NETOWRK_PROBLEM_ERROR,
              400
            );
          } else {
            try {
              const updateEmail = await prisma.user.update({
                where: {
                  id: user.id,
                },
                data: {
                  otpCreateTime: utcDate,
                  otpCode: otpNumber,
                },
              });
              return responseWithData(
                res,
                true,

                SuccessMessages.AUTH.EMAIL_UPDATE_SUCCESSFULLY(email),
                { email: email },
                200
              );
            } catch (error) {
              console.log(error);
            }
          }
        }
      }
    } catch (error) {
      // console.log("Error in update email", error);

      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Error email update",
          error?.message
        ),
        500
      );
    }
  }
);

router.patch(
  "/verfiyOtpProfile",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const { otpCode, email } = req.body;
    const user = req.user;
    try {
      if (!email || email == null || email == undefined) {
        res.status(406).json({ message: "Email is required" });
      } else if (!otpCode || otpCode == null || otpCode == undefined) {
        res.status(406).json({ message: "Otp Code is required" });
      } else {
        const userRecord = await prisma.user.findFirst({
          where: {
            otpCode: otpCode,
          },
        });
        if (!userRecord) {
          return errorResponse(res, ErrorMessages.AUTH.INVALID_OTP, 400);
        } else {
          var utcMoment = moment.utc();
          var utcDate = new Date(utcMoment.format());
          var diff =
            (utcDate.getTime() - userRecord.otpCreateTime.getTime()) / 1000;
          const diffInMinute = diff / 60;
          if (diffInMinute > config.otpExpireTime) {
            return errorResponse(res, ErrorMessages.AUTH.OTP_CODE_EXPIRED, 400);
          } else {
            try {
              const verfiyOtpProfile = await prisma.user.update({
                where: {
                  id: user.id,
                },
                data: {
                  email: email,
                  otpCode: "0",
                },
              });
              return successResponse(
                res,
                SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY(
                  "User account status"
                ),
                200
              );
            } catch (error) {
              console.log(error);
            }
          }
        }
      }
    } catch (error) {
      // console.log("Error in verifyOtpToken", error);
      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Otp Verification",
          error?.message
        ),
        500
      );
    }
  }
);

router.patch(
  "/resendOtpCodeProfile",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const { email } = req.body;
    const user = req.user;
    try {
      if (!email || email == null || email == undefined) {
        res.status(406).json({ message: "Email is required" });
      } else {
        const userRecord = await prisma.user.findFirst({
          where: {
            id: user.id,
          },
        });
        if (!userRecord) {
          return errorResponse(
            res,
            ErrorMessages.COMMON_VALIDATION_ERROR.USER_NOT_FOUND("email"),
            400
          );
        } else {
          let otpNumber = otpGenerator.generate(6, {
            digits: true,
            lowerCaseAlphabets: false,
            upperCaseAlphabets: false,
            specialChars: false,
          });
          let utcDate = getUtcDate();
          let { delivered } = await sendEmail(
            email,
            config.email.resendOtpSubject,
            config.email.template.resendOtp(otpNumber)
          );

          if (!delivered) {
            return errorResponse(
              res,
              ErrorMessages.AUTH.NETOWRK_PROBLEM_ERROR,
              400
            );
          } else {
            try {
              const resendOtp = await prisma.user.update({
                where: {
                  id: user.id,
                },
                data: {
                  otpCreateTime: utcDate,
                  otpCode: otpNumber,
                },
              });
              return successResponse(
                res,
                SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY(
                  "User Otp Updated"
                ),
                200
              );
            } catch (error) {
              console.log(error);
            }
          }
        }
      }
    } catch (error) {
      // console.log("Error in resendOtpToken", error.message);
      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Resend Otp",
          error?.message
        ),
        500
      );
    }
  }
);

router.patch(
  "/updatePasswordOnProfile",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    let id = req.user.id;
    let { oldPassword, password, confirmPassword } = req.body;
    try {
      if (!oldPassword || oldPassword == null || oldPassword == undefined) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Old-Password"),
          400
        );
      } else if (!password || password == null || password == undefined) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Password"),
          400
        );
      } else if (
        !confirmPassword ||
        confirmPassword == null ||
        confirmPassword == undefined
      ) {
        return errorResponse(
          res,
          ErrorMessages.COMMON_VALIDATION_ERROR.MISSING("Confirm-Password"),
          400
        );
      }
      // console.log("oldpass::", oldPassword);
      else if (password !== confirmPassword) {
        return errorResponse(res, ErrorMessages.AUTH.PASSWORD_NOT_MATCH, 400);
      } else {
        let userRecord = await prisma.user.findFirst({
          where: {
            id: id,
          },
        });

        if (!userRecord) {
          return errorResponse(
            res,
            ErrorMessages.COMMON_VALIDATION_ERROR.USER_NOT_FOUND(id),
            400
          );
        } else {
          let passwordCompare = await comparePassword(
            oldPassword,
            userRecord.password
          );

          if (!passwordCompare) {
            return errorResponse(
              res,
              ErrorMessages.AUTH.WRONG_OLD_PASSWORD,
              400
            );
          } else {
            let hash = await hashPassword(password);

            try {
              const updatePasswordOnProfile = await prisma.user.update({
                where: {
                  id: id,
                },
                data: {
                  password: hash,
                },
              });
              return successResponse(
                res,
                SuccessMessages.GENERIC.ITEM_UPDATED_SUCCESSFULLY("Password"),
                200
              );
            } catch (error) {
              console.log(error);
            }
          }
        }
      }
    } catch (error) {
      // console.log("updatePasswordOnProfile", error);
      return errorResponse(
        res,
        ErrorMessages.GENERIC_ERROR.OPERATION_FAIL(
          "Facing some issue to update password",
          error?.message
        ),
        500
      );
    }
  }
);

module.exports = router;
