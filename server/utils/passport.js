const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

let opts = {};
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = "6dqw7dydyw7ewyuw";

module.exports = (passport) => {
  passport.use(
    new JwtStrategy(opts, (jwt_payload, done) => {
      prisma.user
        .findFirst({
          where: {
            id: jwt_payload.id,
          },
        })
        .then((user) => {
          if (user) {
            // console.log("user pass", user);
            return done(null, user);
          }
          return done(null, false);
        })
        .catch((err) => console.log(err));
    })
  );
};
