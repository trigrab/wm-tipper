/**
 * GET /
 * Home page.
 */

exports.index = function(req, res) {
  res.render('admin/index', {
    title: 'Admin Menu'
  });
};
