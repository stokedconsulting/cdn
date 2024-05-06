/* eslint-disable import/no-extraneous-dependencies */
// ==========================================================================
// Publish a version to CDN and demo
// ==========================================================================
/* eslint no-console: "off" */

const path = require("path");
const gulp = require("gulp");
// Utils
const gitbranch = require("git-branch");
const rename = require("gulp-rename");
const { green, bold } = require("colorette");
const log = require("fancy-log");
const open = require("gulp-open");
// Deployment
const aws = require("aws-sdk");
const publish = require("gulp-awspublish");
// Configs
const deploy = require("../deploy.json");
// Info from package

// Get AWS config
Object.values(deploy).forEach((target) => {
  Object.assign(target, {
    publisher: publish.create({
      region: target.region,
      params: {
        Bucket: target.bucket,
      },
      credentials: new aws.SharedIniFileCredentials({ profile: "plyr" }),
    }),
  });
});

// Paths
const root = path.join(__dirname, "../..");
const paths = {
  upload: [path.join(root, `plyr/**/*`)],
};

// Get git branch info
const currentBranch = (() => {
  try {
    return gitbranch.sync();
  } catch (_) {
    return null;
  }
})();

const branch = {
  current: currentBranch,
  isMaster: currentBranch === "master",
  isBeta: currentBranch === "beta",
};

const maxAge = 31536000; // 1 year
const options = {
  cdn: {
    headers: {
      "Cache-Control": `max-age=${maxAge}, immutable`,
    },
  },
  demo: {
    uploadPath: branch.isBeta ? "beta" : null,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    },
  },
  symlinks(ver, filename) {
    return {
      headers: {
        // http://stackoverflow.com/questions/2272835/amazon-s3-object-redirect
        "x-amz-website-redirect-location": `/${ver}/${filename}`,
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      },
    };
  },
};

const renameFile = rename((p) => {
  p.dirname = p.dirname.replace('.', 'plyr'); // eslint-disable-line
});

// Check we're on the correct branch to deploy
const canDeploy = () => {
  if (![branch.isMaster, branch.isBeta].some(Boolean)) {
    console.error(
      `Must be on an allowed branch to publish! (current: ${branch.current})`
    );
    return false;
  }

  return true;
};

gulp.task("plyr", (done) => {
  if (!canDeploy()) {
    done();
    return null;
  }

  const { publisher } = deploy.cdn;

  if (!publisher) {
    throw new Error("No publisher instance. Check AWS configuration.");
  }

  log(`Publish ${green(bold("plyr"))}...`);

  return gulp
    .src(paths.upload)
    .pipe(renameFile)
    .pipe(publisher.publish(options.cdn.headers))
    .pipe(publish.reporter());
});

// Open the demo site to check it's ok
gulp.task("open", () => {
  const { domain } = deploy.cdn;

  return gulp.src(__filename).pipe(
    open({
      uri: `https://${domain}/${branch.isBeta ? "beta" : ""}`,
    })
  );
});

// Do everything
gulp.task("publish", gulp.series("plyr", "open"));
