var mongoose = require('mongoose');
var Group = require('../models/Group');

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

  Group.list({}, function (err, _groups) {
    if (err) return next(err);

    res.render('group/index.jade', {
      title: 'Alle Gruppen',
      groups: _groups
    });

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
  }
  newGroup.members.push(req.user);

  newGroup.save(function(err, group) {
    if (err) {
      return next(err);
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

  // TODO: render correctly

  if(!group) {
    req.flash('error', { msg: 'Diese Gruppe existiert nicht.' });
    res.redirect('/groups');
  } else {
    var userAlreadyInGroup = req.user.groups.some(function (userGroup) {
      return userGroup.equals(group._id);
    });
    res.render('group/show.jade', {
      title: 'Gruppen Details',
      group: group,
      isOwner: group.founder._id.equals(req.user._id),
      isAdmin: req.user.admin,
      isMember: userAlreadyInGroup
    });
  }

};

/**
 *  Join a group
 */
exports.join = function (req, res, next) {
  var group = req.group;

  var userAlreadyInGroup = req.user.groups.some(function (userGroup) {
    return userGroup.equals(group._id);
  });

  if (userAlreadyInGroup) {
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

  /**
   * 1. find group
   * 2. check if user not yet in group
   * 3. add user to group
   * 4. add group to user
   * 5 redirect with confirmation
   */

  var userAlreadyInGroup = req.user.groups.some(function (userGroup) {
    return userGroup.equals(group._id);
  });

  if(!group) {
    req.flash('error', { msg: 'Diese Gruppe existiert nicht.' });
    res.redirect('/groups');
  }

  group.members.push(req.user);

  group.save(function(err, group) {
    if (err) return next(err);
    var user = req.user;
    req.user.groups.push(group);
    user.save(function(err, user) {
      if (err) return next(err);
      req.flash('success', { msg: 'Du bist der Gruppe beigetreten.' });
      res.redirect('/groups/' + group.slug);
    });
  });


};



/**
 *  Delete Group
 */
exports.delete = function (req, res, next) {

  var group = req.group;

  group.remove(function (err) {
    if (err) return next(err);

    res.send(200, 'Group removed');
  });
};

/**
 * Update Group
 */
exports.update = function (req, res, next) {

  var group = req.group;

  console.dir(req.body);

  group.set(req.body);

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
