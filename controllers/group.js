var mongoose = require('mongoose');
var Group = require('../models/Group');
var Match = require('../models/Match');
var _ = require('lodash');

var async = require('async');
var Promise = require('bluebird');

var nodemailer = require('nodemailer');
var secrets = require('../config/secrets');

var utils = require('../helpers/utils');

var passportConf = require('../config/passport');

'use strict';


exports.load = function(req, res, next, id) {
  Group.load(id, function (err, group) {
    if (err) return next(err);
    //if (!group) return next(new Error('not found'));
    req.group = group;
    next();
  });
}

exports.index = function (req, res, next) {

  // pagination
  var totalCount = Group.count();
  var perPage = 10;
  var page = req.query.page || 1;

  Group.list({}, function (err, allGroups) {
    if (err) return next(err);

    if (req.user) {
      Group.list({ criteria: { 'members': req.user._id } }, function (err, userGroups) {
        if (err) return next(err);
        res.render('group/index.jade', {
          title: 'Alle Tippgruppen',
          groups: allGroups,
          userGroups: userGroups
        });
      });
    } else {
      res.render('group/index.jade', {
        title: 'Alle Tippgruppen',
        groups: allGroups,
        userGroups: []
      });
    }

  });
}

exports.indexJson = function (req, res, next) {

  Group.list({}, function (err, _groups) {
    if (err) return next(err);

    var select_json = _groups.map(function(group) {
      return {
        id: group._id,
        text: group.name
      };
    });

    res.json(select_json);

  });
}


exports.new = function (req, res, next) {
  res.render('group/new.jade', {
    title: "Create Group",
    group: new Group({})
  });
  console.dir(res.locals);
}

exports.edit = function (req, res, next) {
  res.render('group/edit.jade', {
    title: "Edit Group",
    group: req.group
  });
  console.dir(res.locals);
}


exports.create = function (req, res, next) {

  console.log('creating new group:');
  console.dir(req.body);
  console.log('current user:');
  console.dir(req.user);

  var newGroup = new Group(req.body);
  newGroup.founder = req.user;
  if (!req.body.password || req.body.password === '') {
    newGroup.is_public = true;
  } else {
    // save password for group as plain text for simplicity when sending invite emails
    // but notify user's of this beforehand
    newGroup.password_freetext = req.body.password;
  }



  newGroup.members.push(req.user);

  newGroup.save(function(err, group) {
    if (err) {
      if (err.code === 11000) {
        req.flash('error', { msg: 'Es existiert schon eine Gruppe mit diesem Namen.' });
      } else {
        req.flash('error', { msg: 'Ein Fehler ist aufgetreten. Bitte versuche es noch einmal, vielleicht mit anderem Namen.' });
      }
      return res.redirect('/groups');
    }
    // need to add group also to user
    req.user.addGroup(group, function() {
      req.flash('success', { msg: 'Gruppe wurde erstellt.' });
      return res.redirect('/groups');
    });
  });
}


/**
 *  Get group by id
 */
exports.show = function (req, res, next) {
  var group = req.group;

  var userIsOwner = req.user && group.founder && group.founder._id.equals(req.user._id);
  var userIsAdmin = req.user.admin;
  var userIsMember = utils.userInGroup(req.user, group);

  if(!group) {
    req.flash('error', { msg: 'Diese Gruppe existiert nicht.' });
    res.redirect('/groups');
  } else {
    // dont show private groups to non members
    if (!group.is_public && !(userIsOwner || userIsAdmin || userIsMember)) {
      req.flash('info', { msg: 'Passwort erforderlich.' });
      return res.redirect('/groups/' + group.slug + '/join');
    };
    Match.count({ isDummy: false }, function(err, matchCount) {
      if (err) next(err);


      group.members.forEach(function(usr) {
        var groupIndex = usr.groups.indexOf(group._id);
        console.log('found groupINdex ' + groupIndex, usr.groupPoints);
        if (groupIndex !== undefined) {
          usr.currentPoints = usr.groupPoints[groupIndex];
          if (usr.groupStats[groupIndex]) {
            usr.currentStats = usr.groupStats[groupIndex];
          } else {
            usr.currentStats = { total: 0, correct: 0, tendency: 0, wrong: 0 };
          }
        } else {
          usr.currentPoints = 0; // too harsh ?
          usr.currentStats = { total: 0, correct: 0, tendency: 0, wrong: 0 };
        }

      });

      //
      //var sortedUsers = _(group.members).chain().sortBy(function(usr) {
      //  return -usr.currentPoints;
      //}).sortBy(function(usr) {
      //  return -usr.currentStats.correct;
      //}).sortBy(function(usr) {
      //  return -usr.currentStats.tendency;
      //}).value();
      //

      var sortedUsers = _.sortBy(group.members, function(usr) {
        return -usr.currentPoints;
      });


      res.render('group/show.jade', {
        title: 'WM-Tipper Gruppe - ' + group.name,
        group: group,
        isOwner: userIsOwner,
        isAdmin: userIsAdmin,
        isMember: userIsMember,
        sortedUsers: sortedUsers,
        matchCount: matchCount,
        comments: group.comments.reverse()
      });

    });
  }

};

/**
 *  Join a group
 */
exports.join = function (req, res, next) {
  var group = req.group;


  if (utils.userInGroup(req.user, group)) {
    req.flash('error', { msg: 'Du bist bereits in dieser Gruppe.' });
    res.redirect('/groups');
  }

  if(!group) {
    req.flash('error', { msg: 'Diese Gruppe existiert nicht.' });
    res.redirect('/groups');
  } else {
    res.render('group/join.jade', {
      title: 'Einer Gruppe beitreten',
      group: group
    });
  }
};


/**
 *  Join confirm
 */
exports.joinConfirm = function (req, res, next) {
  var group = req.group;
  var user = req.user;

  /**
   * 1. find group
   * 2. check if user not yet in group
   * 3. add user to group
   * 4. add group to user
   * 5 redirect with confirmation
   */
  var password = req.body.password;
  console.log('trying to join group with pw: ' + password);

  var joinGroup = function(_group, _user, _req, _res) {
    _group.members.push(_user);
    _group.save(function(err, _group) {
      if (err) return next(err);

      _user.groups.push(_group);
      _user.save(function(err, _user) {
        if (err) return next(err);
        _req.flash('success', { msg: 'Du bist der Gruppe beigetreten.' });
        return _res.redirect('/groups/' + _group.slug);
      });
    });
  };

  if(!group) {
    req.flash('error', { msg: 'Diese Gruppe existiert nicht.' });
    return res.redirect('/groups');
  }


  if (utils.userInGroup(user, group)) {
    req.flash('error', { msg: 'Du bist bereits in dieser Gruppe.' });
    return res.redirect('/groups/' + group.slug);
  }

  if (!group.is_public) {
    if (!password) {
      req.flash('error', { msg: 'Du musst ein Passwort angeben.' });
      return res.redirect('/groups/' + group.slug + '/join');
    }
    group.comparePassword(password, function(err, isMatch) {
      if (!isMatch) {
        req.flash('error', { msg: 'Das Passwort ist nicht korrekt.' });
        return res.redirect('/groups/' + group.slug + '/join');
      } else {
        joinGroup(group, user, req, res);
      }
    });
  } else {
    joinGroup(group, user, req, res);
  }

};



/**
 *  Delete Group
 */
exports.delete = function (req, res, next) {

  var group = req.group;

  group.remove(function (err) {
    if (err) return next(err);

    req.flash('success', { msg: 'Die Gruppe wurde gelöscht.' });
    return res.redirect('/groups');
  });
};

/**
 *  Leave Group
 */
exports.leave = function (req, res, next) {

  var group = req.group;

  console.dir(group.members);
  console.log('user ' + req.user._id  + ' wants to leave');

  // remove user from group
  group.update({ $pull: { 'members': req.user._id } }, function (err) {
    if (err) return next(err);
    // remove group from user
    req.user.update({ $pull: { 'groups': group._id } }, function(err) {
      if (err) return next(err);

      req.flash('success', { msg: 'Du hast die Gruppe verlassen.' });
      return res.redirect('/groups');
    });

  });
};

/**
 * Update Group
 */
exports.update = function (req, res, next) {

  var group = req.group;

  console.dir(req.body);

  group.set(req.body);

  group.password_freetext = req.body.password;

  group.save(function(err, group) {
    if (!err) {
      console.log('update successful');
      return res.redirect('/groups/' + group.slug);
    } else {
      return next(err);
    }
  });

};

/**
 * Beitreten oder Gründen
 */

exports.joinOrCreate = function(req, res, next) {
  // send all current goups so it can be filtered
  Group.list({}, function (err, _groups) {
    if (err) return next(err);

    res.render('group/joinOrCreate.jade', {
      title: 'Erste Schritte',
      groups: _groups
    });

  });
};


/*
 * Send an invite email
 */
exports.sendInvite = function(req, res, next) {
  var email = req.body.email;
  var group = req.group;
  var user = req.user;

  var customMessage = req.body.message;

  req.assert('email', 'Email ungültig').isEmail();
  var errors = req.validationErrors();

  if (errors) {
    req.flash('error', errors);
    return res.redirect('/groups/' + group.slug);
  } else {

    var smtpTransport = nodemailer.createTransport('SMTP', {
      service: 'SendGrid',
      auth: {
        user: secrets.sendgrid.user,
        pass: secrets.sendgrid.password
      }
    });

    var mailOptions = {
      to: email,
      from: 'no-reply@wm-tipper.de',
      subject: user.profile.name + ' hat dich in die WM Tippgruppe ' + group.name + ' eingeladen',
      text: 'Moin,\n\n' +
        'Du wurdest von ' + user.profile.name + ' in eine Tippgruppe auf http://wm-tipper.de eingeladen!\n\n' +
        'Um jetzt der Tippgruppe beizutreten, klicke folgenden Link an:\n' +
        'http://' + req.headers.host + '/groups/' + group.slug + '/join \n\n'
    };

    if (!group.is_public && group.password_freetext) {
      mailOptions.text += 'Das Passwort zum beitreten der Gruppe lautet: ' + group.password_freetext + ' \n\n';
    }

    if (customMessage) {
      mailOptions.text += user.profile.name + ' hat dir ausserdem folgende Nachricht hinterlassen:\n\n' + customMessage;
    }

    smtpTransport.sendMail(mailOptions, function(err) {
      if (err) return next(err);
      req.flash('success', { msg: 'Deine Einladung an ' + email + ' wurde versendet.'})
      return res.redirect('/groups/' + group.slug);
    });

  }

};


exports.addComment = function(req, res, next) {
  var name = req.user.profile.name;


  if (req.body.comment && req.body.comment.length > 0) {
    var comment = {
      user: name,
      date: Date.now(),
      body: req.body.comment
    };

    var group = req.group;

    group.comments.push(comment);
    group.save(function(err, group) {
      if (err) next(err);
      req.flash('success', { msg: 'Kommentar wurde gespeichert.' });
      res.redirect('/groups/' + group.slug);
    });
  } else {
    req.flash('error', { msg: 'Du musst einen Kommentar angeben.' });
    res.redirect('/groups/' + group.slug);
  }


};

