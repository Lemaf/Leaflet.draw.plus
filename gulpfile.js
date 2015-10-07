var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var sourcemaps = require('gulp-sourcemaps');
var rename = require('gulp-rename');
var del = require('del');
var jshint = require('gulp-jshint');
var less = require('gulp-less');

gulp.task('clean:dist', function() {
	return del(['./dist/**/*.js']);
});

gulp.task('jshint', function() {
	return gulp.src(['./src/**/*.js'])
		.pipe(jshint())
		.pipe(jshint.reporter('default'))
		.pipe(jshint.reporter('fail'));
});

gulp.task('concat', ['jshint', 'clean:dist'], function() {

	return gulp.src([
			'./src/Toolbar.js',
			'./src/draw/*.js',
			'./src/formats/*.js',
			'./src/ext/*.js',
			'./src/validation/*.js'
		])
		.pipe(sourcemaps.init())
			.pipe(concat('leaflet.draw.plus.js', {newLine: '\n'}))
		.pipe(sourcemaps.write())
		.pipe(gulp.dest('./dist/'));
});

gulp.task('minify', ['concat'], function() {
	return gulp.src('./dist/**/*.js')
		.pipe(rename(function(path) {
			path.extname = '-min.js';
		}))
		.pipe(uglify())
		.pipe(gulp.dest('./dist'))
});

gulp.task('less', function() {
	return gulp.src('./less/**/*.less')
	.pipe(less())
	.pipe(gulp.dest('./dist/'));
});

gulp.task('watch:js', function() {
	return gulp.watch('./src/**/*.js', ['concat']);
});

gulp.task('watch:less', function() {
	return gulp.watch('./less/**/*.less', ['less']);
});

gulp.task('default', ['watch:js', 'watch:less']);