var FileSystem = require('./filesystem/filesystem')
var Interface = require('./interface/interface')
var Editor = require('./editor/editor')
var Remote = require('./network/remote')
var HyperHostWrapper = require('./network/hyperhostwrapper')

var DEFAULT_HOSTNAME = 'https://quiet-shelf-57463.herokuapp.com'

function Multihack (config) {
  var self = this
  if (!(self instanceof Multihack)) return new Multihack(config)

  config = config || {}

  Interface.on('openFile', function (e) {
    Editor.open(e.path)
  })

  Interface.on('addFile', function (e) {
    var created = FileSystem.mkfile(e.path)
    
    if (created) {
      Interface.treeview.addFile(e.parentElement, FileSystem.get(e.path))
      Editor.open(e.path)
    }
  })

  Interface.on('addDir', function (e) {
    var created = FileSystem.mkdir(e.path)
    
    if (created) {
      Interface.treeview.addDir(e.parentElement, FileSystem.get(e.path))
    }
  })

  Interface.on('removeFile', function (e) {
    Interface.treeview.remove(e.parentElement, FileSystem.get(e.path))
    FileSystem.delete(e.path)
    if (self._remote) {
      self._remote.deleteFile(e.path)
    }
  })

  Interface.on('deleteCurrent', function (e) {
    var workingPath = Editor.getWorkingFile().path
    var parentElement = Interface.treeview.getParentElement(workingPath)
    Interface.treeview.remove(parentElement, FileSystem.get(workingPath))
    FileSystem.delete(workingPath)
    Editor.close()
    self._remote.deleteFile(workingPath)
  })

  // Initialize project and room
  self.roomID = Math.random().toString(36).substr(2)
  self.hostname = config.hostname

  Interface.on('saveAs', function (saveType) {
    FileSystem.saveProject(saveType, function (success) {
      if (success) {
        Interface.alert('Save Completed', 'Your project has been successfully saved.')
      } else {
        Interface.alert('Save Failed', 'An error occured while trying to save your project.<br>Please select a different method.')
      }
    })
  })

  Interface.on('deploy', function () {
    HyperHostWrapper.on('error', function (err) {
      Interface.alert('Deploy Failed', err)
    })
    
    HyperHostWrapper.on('ready', function (url) {
      Interface.alert('Website Deployed', 'Anyone can visit your site at<br><a target="_blank" href="' + url + '">' + url + '</a>')
    })
    
    HyperHostWrapper.deploy(FileSystem.getTree())
  })

  Interface.removeOverlay()
  Interface.getProject(function (project) {
    if (!project) {
      self._initRemote()
    } else {
      Interface.showOverlay()
      FileSystem.loadProject(project, function (tree) {
        Interface.treeview.render(tree)
        self._initRemote()
      })
    }
  })
}

Multihack.prototype._initRemote = function () {
  var self = this

  Interface.getRoom(self.roomID, function (data) {
    self.roomID = data.room
    self.nickname = data.nickname
    self._remote = new Remote(self.hostname, self.roomID, self.nickname)
    
    document.getElementById('voice').style.display = ''
    document.getElementById('network').style.display = ''

    Interface.on('voiceToggle', function () {
      self._remote.voice.toggle()
    })
    Interface.on('resync', function () {
      self._remote.requestProject()
    })
    Interface.on('showNetwork', function () {
      Interface.showNetwork(self._remote.peers, self.roomID)
    })

    self._remote.on('change', function (data) {
      var outOfSync = !FileSystem.exists(data.filePath)
      Editor.change(data.filePath, data.change)
      if (outOfSync) {
        Interface.treeview.rerender(FileSystem.getTree())
      }
    })
    self._remote.on('deleteFile', function (data) {
      var parentElement = Interface.treeview.getParentElement(data.filePath)
      Interface.treeview.remove(parentElement, FileSystem.get(data.filePath))
      FileSystem.delete(data.filePath)
    })
    self._remote.on('requestProject', function (requester) {
      // Get a list of all non-directory files, sorted by ascending path length
      var allFiles = FileSystem.getAllFiles().sort(function (a, b) {
        return a.path.length - b.path.length
      }).filter(function (a) {
        return !a.isDir
      })
      
      for (var i = 0; i < allFiles.length; i++) {
        self._remote.provideFile(allFiles[i].path, allFiles[i].content, requester)
      }
    })
    self._remote.on('provideFile', function (data) {
      FileSystem.getFile(data.filePath).write(data.content)
      Interface.treeview.rerender(FileSystem.getTree())
    })
    self._remote.on('lostPeer', function (peer) {
      Interface.alert('Connection Lost', 'Your connection to "'+peer.metadata.nickname+'" has been lost.')
    })
    
    Editor.on('change', function (data) {
      self._remote.change(data.filePath, data.change)
    })
  })
}

module.exports = Multihack
