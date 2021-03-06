var mongoose = require('mongoose');
var Match = require('../models/Match');
var Tip = require('../models/Tip');

var utils = require('../helpers/utils');

var passportConf = require('../config/passport');

'use strict';

exports.load = function(req, res, next, id) {
  req.user.loadTip(id, function (err, tip) {
    if (err) return next(err);
    if (!tip) return next(new Error('not found'));
    req.tip = tip;
    next();
  });
}

/*
exports.index = function (req, res, next) {

  Tip.list({}, function (err, _tips) {
    if (err) return next(err);

    res.render('tip/index.jade', {
      title: 'Alle Tips',
      tips: _tips
    });

  });
}
*/

exports.newMatchTip = function (req, res, next) {

  if (req.match.started) {
    req.flash('error', { msg: 'Zu spät! Diese Partie hat bereits angefangen.'});
    return res.redirect('/groups/' + req.group.slug + '/spielplan');
  }

  res.render('tip/new.jade', {
    title: "Neuen Tip erstellen",
    tip: new Tip({}),
    match: req.match,
    group: req.group,
    action: '/groups/'+req.group.slug+'/matches/'+req.match.id+'/tips'
  });

}

exports.edit = function (req, res, next) {

  console.dir(req.tip);


  if (req.match.started) {
    req.flash('error', { msg: 'Zu spät! Dieser Tip darf nicht mehr editiert werden.'});
    res.redirect('/groups/' + req.tip.group.slug + '/spielplan');
  }

  res.render('tip/edit.jade', {
    title: "Tip editieren",
    tip: req.tip,
    match: req.match,
    group: req.group,
    action: '/groups/'+req.group.slug+'/matches/'+req.match._id+'/tips/'+req.tip._id
  });

}


exports.create = function (req, res, next) {

  if (req.match.started) {
    req.flash('error', { msg: 'Zu spät! Diese Partie hat bereits angefangen.'});
    return res.redirect('/groups/' + req.group.slug + '/spielplan');
  }

  var newTip = new Tip(req.body);

  newTip.group = req.group;

  var error = false;

  for (var i = 0; i < req.user.tips.length; i++) {
    if (req.user.tips[i].match.equals(req.body.match) && req.user.tips[i].group.equals(req.group._id)) {
      req.flash('error', { msg: 'Du hast dieses Match bereits in dieser Gruppe getippt.' });
      error = true;
      return res.redirect('groups/' + req.group.slug + '/spielplan');
    };
  }

  if (!error) {
    req.user.tips.push(newTip);

    req.user.groupName = req.group.name;

    req.user.save(function(err, tip) {
      if (err) {
        return next(err);
      }
      req.flash('success', { msg: 'Dein Tip wurde gespeichert.' });
      return res.redirect('groups/' + req.group.slug + '/spielplan');
    });
  }

}


/**
 *  Get tip by id
 */
exports.show = function (req, res, next) {
  var tip = req.tip;

  if(!tip) {
    req.flash('error', { msg: 'Dieser Tip existiert nicht.' });
    res.redirect('/');
  } else {
    res.render('tip/show.jade', {
      title: 'Tip Details',
      tip: req.tip
    });
  }
};


/**
 *  Get tip by id
 */
exports.showGroupTip = function (req, res, next) {
  var tip = req.tip;


  if(!tip) {
    req.flash('error', { msg: 'Dieser Tip existiert nicht.' });
    res.redirect('/');
  } else {
    res.render('tip/show.jade', {
      title: 'Tip Details',
      tip: req.tip,
      group: req.group
    });
  }
};

/**
 *  Delete Tip
 */
exports.delete = function (req, res, next) {

  var tip = req.tip;

  tip.remove(function (err) {
    if (err) return next(err);

    res.send(200, 'Tip removed');
  });
};

/**
 * Update Tip
 */
exports.update = function (req, res, next) {

  var tip = req.tip;
  var group = req.group;

  Match.findOne({ '_id': tip.match }, function(err, match) {

    if (err) return next(err);

    if (!match || match.started) {
      req.flash('error', { msg: 'Zu spät! Dieser Tip darf nicht mehr editiert werden.'});
      return res.redirect('/groups/' + req.tip.group.slug + '/spielplan');
    } else {
      tip.scoreTeam1 = req.body.scoreTeam1;
      tip.scoreTeam2 = req.body.scoreTeam2;

      if (tip.scoreTeam1 > tip.scoreTeam2) {
        tip.bet = '1';
      }
      if (tip.scoreTeam1 < tip.scoreTeam2) {
        tip.bet = '2';
      }
      if (tip.scoreTeam1 === tip.scoreTeam2) {
        tip.bet = 'X';
      }

      req.user.groupName = group.name;

      req.user.save(function(err, user) {
        if (!err) {
          req.flash('success', { msg: 'Dein Tip wurde aktualisiert.' });
          return res.redirect('/groups/'+group.slug+'/spielplan')
        } else {
          return next(err);
        }
      });
    }
  });

};

