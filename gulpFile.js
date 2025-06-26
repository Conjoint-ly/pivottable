const gulp = require('gulp');
const { series, parallel } = require('gulp');
const git = require('gulp-git');
const bump = require('gulp-bump');
const filter = require('gulp-filter');
const tag_version = require('gulp-tag-version');
const spawn = require('child_process').spawn;
const coffee = require('gulp-coffee');
const uglify = require("gulp-uglify");
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const concat = require('gulp-concat');
const cleanCSS = require('gulp-clean-css');
const serve = require('gulp-serve');
const log = require('fancy-log');

function makeCss() {
    return gulp.src('./dist/pivot.css')
        .pipe(cleanCSS())
        .pipe(concat('pivot.min.css'))//trick to output to new file
        .pipe(gulp.dest('./dist/'));
}

function makeJs() {
    return gulp.src(['./src/*.coffee', './locales/*.coffee', './tests/*.coffee'])
        //compile to js (and create map files)
        .pipe(sourcemaps.init())
        .pipe(coffee()).on('error', log)
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./dist'));
}

function makeJsMin() {
    return gulp.src(['./src/*.coffee', './locales/*.coffee', './tests/*.coffee'])
        //compile to js (and create map files)
        .pipe(sourcemaps.init())
        .pipe(coffee()).on('error', log)
        //minify js files as well
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(sourcemaps.init({loadMaps: true}))//load the source maps generated in the first step
        .pipe(uglify())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./dist'));
}

function inc(importance) {
    // get all the files to bump version in
    return gulp.src(['./package.json', './bower.json', './pivottable.jquery.json'])
        // bump the version number in those files
        .pipe(bump({type: importance}))
        // save it back to filesystem
        .pipe(gulp.dest('./'));
}

// gulp.task('publish', function (done) {
//   spawn('npm', ['publish'], { stdio: 'inherit' }).on('close', done);
// });

function push(done) {
    git.push('origin', 'master', {args: '--tags'}, function (err) {
        if (err) throw err;
        done();
    });
}

function tag() {
    return gulp.src(['./package.json', './bower.json', './pivottable.jquery.json'])
    .pipe(git.commit('version bump'))
    // read only one file to get the version number
    .pipe(filter('package.json'))
    .pipe(tag_version());
}

function bumpPatch() { return inc('patch'); }
function bumpMinor() { return inc('minor'); }
function bumpMajor() { return inc('major'); }

function patch() {
    return series(bumpPatch, build, tag, push)();
}
function minor() {
    return series(bumpMinor, build, tag, push)();
}
function major() {
    return series(bumpMajor, build, tag, push)();
}

function watchFiles() {
    gulp.watch(['./src/*.coffee', './locales/*.coffee', './tests/*.coffee'], parallel(makeJs, makeJsMin));
    gulp.watch('./dist/pivot.css', makeCss);
}

// Build task that combines makeJs and makeCss
const build = parallel(makeJs, makeJsMin, makeCss);

// Export tasks
exports.makeCss = makeCss;
exports.makeJs = makeJs;
exports.makeJsMin = makeJsMin;
exports.bumpPatch = bumpPatch;
exports.bumpMinor = bumpMinor;
exports.bumpMajor = bumpMajor;
exports.patch = patch;
exports.minor = minor;
exports.major = major;
exports.push = push;
exports.tag = tag;
exports.serve = serve('.');
exports.watch = watchFiles;
exports.build = build;
exports.default = build;
