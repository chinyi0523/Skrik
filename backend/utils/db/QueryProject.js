const mongoose = require('mongoose');
const Projects = require('./ProjectSchema');
const UserData = require('./UserDataSchema');
const regxstr = /^[ A-Za-z0-9_.-]+$/;
const regxhex = /^[a-f0-9]+$/;
const regxnewline = /[\n]/;

/*Readme
if you want to "update line" delete line first then insert line 
insert one line
*/

// add LineChange (insert or delete a line)
async function addLineChange(projectid, filename, username, linenum, commit_type, content) {
    projectid = projectid.toLowerCase();
    if (projectid.match(regxhex) === null || projectid.length !== 24)
        return { "success": false, "description": "Invalid Projectid!!!" };
    if (filename.match(regxstr) === null)
        return { "success": false, "description": "Invalid File Name!!!" };
    if (username.match(regxstr) === null)
        return { "success": false, "description": "Invalid Username!!!" };
    if (typeof linenum !== "number" || linenum < 1)
        return { "success": false, "description": "Invalid Line Index!!!" };
    if (commit_type !== "insert" && commit_type !== "delete")
        return { "success": false, "description": "Invalid Commit Type!!!" };
    if (content.match(regxnewline) !== null)
        return { "success": false, "description": "Invalid content!!!" };
    try{
        var project = await Projects.findById(projectid);
    } catch(err) {
        console.error("[db] error querying project in project database: " + err);
        return { "success": false, "description": "querying project Failed!!!" };
    }
    if(project === null)
        return { "success": false, "description": "Project Not Found!!!" };
    else if (project.Deleted === true)
        return { "success": false, "description": "Project Has Been Deleted!!!" };

    var file = project.Files.find(function(item){
        return item.FileName === filename;
      });
    if(typeof file === "undefined")
    {
        project.Files.push({ FileName: filename, Deleted: false });
        file = project.Files.find(function(item){
            return item.FileName === filename;
          });
    }
    else if(file.Deleted === true)
        file.Deleted = false;

    try{
        file.LineChanges.push({Index: linenum, 
                               Type: commit_type, 
                               CreateTime: Date.now(), 
                               UpdateTime: Date.now(),
                               Deleted: false,
                               User: username,
                               Data: content});
        project.save();
    } catch (err) {
        console.error("[db] error adding LineChange: " + err);
        return { "success": false, "description": "LineChange Creation Failed!!!" };
    }
    return { "success": true, "description": "LineChange Creation Finished!!!" };
}

// delete a file in projectid
async function deleteFile(projectid, filename, username){
    projectid = projectid.toLowerCase();
    if (projectid.match(regxhex) === null || projectid.length !== 24)
        return { "success": false, "description": "Invalid Projectid!!!" };
    if (filename.match(regxstr) === null)
        return { "success": false, "description": "Invalid File Name!!!" };
    if (username.match(regxstr) === null)
        return { "success": false, "description": "Invalid Username!!!" };
    try{
        var project = await Projects.findById(projectid);
    } catch (err) {
        console.error("[db] error querying File in project database: ", err);
        return { "success": false, "description": "Project Not Found!!!" };
    }
    if(project === null)
        return { "success": false, "description": "Project Not Found!!!" };
    else if (project.Deleted === true)
        return { "success": false, "description": "Project Has Been Deleted!!!" };

    var file = project.Files.find(function(item){
        return item.FileName === filename;
      });
    if(file === undefined)
        return { "success": false, "description": "File Not Found!!!" };
    if( file.Deleted === true)
        return { "success": false, "description": "File Has Already Been Deleted!!!" };
    try{
        file.Deleted = true;
        file.LineChanges.push({Index: 0,
                               Type: "drop",
                               CreateTime: Date.now(),
                               UpdateTime: Date.now(),
                               Deleted: false,
                               User: username});
        project.save();
    } catch (err) {
        console.error("[db] error creating File in project database: ", err);
        return { "success": false, "description": "File Deletion Failed!!!" };
    }
    return { "success": true, "description": "File Deletion Finished!!!" };
}

// create a project
async function createProject(projectname, usernames){
    if (projectname.match(regxstr) === null)
        return { "success": false, "description": "Invalid Project Name!!!" };
    
    if (Array.isArray(usernames) === false)
        return { "success": false, "description": "Username List Should Be Array!!!" };
    for (let username of usernames)
    {
        if (username.match(regxstr) === null)
            return { "success": false, "description": "Invalid User Name!!!" };
        try{
            var userdata = await UserData.findOne({Username: username});
        } catch (err) {
            console.error("[db] error querying user in User collection: " + err);
            return { "success": false, "description": "Querying user Failed!!!", "ids": null };
        }
        
        if (userdata === null)
            return { "success": false, "description": `Username: \"${username}\" Not Found!!!` };
    }
    try{  
        var project = await Projects.create({ ProjectName: projectname, Users: usernames, Deleted: false });
    } catch (err) {
        console.error("[db] error creating project in project database: " + err);
        return { "success": false, "description": "Project creation Failed!!!" };
    }
    
    for (let username of usernames)
    {
        var userdata = await UserData.findOne({Username: username});
        userdata.ProjectIds.push(project._id);
        try{
            userdata.save();
        } catch (err){
            console.error(`[db] error adding projectid in ${userdata}: ` + err);
            return { "success": false, "description": `Store id Failed in Username: ${userdata}!!!` };
        }
    }
    try{
        project.save();
    } catch (err)
    {
        console.error("[db] error querying user in User collection: " + err);
            return { "success": false, "description": "Querying user Failed!!!", "ids": null };
    }
    return { "success": true, "description": "Project Creation Finished!!!" };
}

// delete a project
// not to be use now
async function deleteProject(projectid){
    projectid = projectid.toLowerCase();
    if (projectid.match(regxhex) === null || projectid.length !== 24)
        return { "success": false, "description": "Invalid Projectid!!!" };
    try {
        var project = await Projects.findById(projectid);
    } catch (err) {
        console.error("[db] error deleting project in project database: " + err);
        return { "success": false, "description": "Project Querying Failed!!!" };
    }
    if(project === null)
        return { "success": false, "description": "Project Not Found!!!" };
    else if (project.Deleted === true)
        return { "success": false, "description": "Project Has Been Deleted!!!" };

    project.Deleted = true;
    for (let username of project.Users)
    {
        try{
            var userdata = await UserData.findOne({Username: username});
        } catch (err) {
            console.error("[db] error querying user in User collection: " + err);
            return { "success": false, "description": "Querying user Failed!!!", "ids": null };
        }
        for( var i = 0; i < userdata.ProjectIds.length; i++){ 
            if ( userdata.ProjectIds[i] === projectid) { 
                userdata.ProjectIds.splice(i, 1);
                break;
            }
        }

        try{
            userdata.save();
        } catch (err){
            console.error(`[db] error adding projectid in ${userdata}: ` + err);
            return { "success": false, "description": `Store id Failed in Username: ${userdata}!!!` };
        }
    }

    try{
        project.save();
    } catch (err) {
        console.error("[db] error saving project in project database: " + err);
        return { "success": false, "description": "Project Deletion Failed!!!" };
    }

    return { "success": true, "description": "Project Deletion Finished!!!" };
}

async function listFiles(projectid){
    projectid = projectid.toLowerCase();
    if (projectid.match(regxhex) === null || projectid.length !== 24)
        return { "success": false, "description": "Invalid Projectid!!!", "files": null  };
    try {
        var project = await Projects.findById(projectid);
    } catch (err) {
        console.error("[db] error deleting project in project database: " + err);
        return { "success": false, "description": "Project Querying Failed!!!", "files": null  };
    }
    if(project === null)
        return { "success": false, "description": "Project Not Found!!!", "files": null  };
    else if (project.Deleted === true)
        return { "success": false, "description": "Project Has Been Deleted!!!", "files": null };
    
    filenames = [];
    project.Files.forEach(function(file){
        filenames.push(file.FileName);
    });
    return { "success": true, "description": "List Files!!!", "files": filenames };

}

//test
async function getFile(projectid, filename){
    projectid = projectid.toLowerCase();
    if (projectid.match(regxhex) === null || projectid.length !== 24)
        return { "success": false, "description": "Invalid Projectid!!!" };
    if (filename.match(regxstr) === null)
        return { "success": false, "description": "Invalid File Name!!!", "content": null };
    
    try{
        var project = await Projects.findById(projectid);
    } catch (err) {
        console.error("[db] error querying File in project database: ", err);
        return { "success": false, "description": "Project Not Found!!!", "content": null };
    }
    if(project === null)
        return { "success": false, "description": "Project Not Found!!!", "content": null };
    else if (project.Deleted === true)
        return { "success": false, "description": "Project Has Been Deleted!!!", "content": null };

    var file = project.Files.find(function(item){
        return item.FileName === filename;
        });
    if(file === undefined)
        return { "success": false, "description": "File Not Found!!!", "content": null };
    if( file.Deleted === true)
        return { "success": false, "description": "File Has Already Been Deleted!!!", "content": null };
    
    data = []
    for (let linechange of file.LineChanges)
    {
        if(linechange.Type === "insert")
            data.splice(linechange.linenum - 1, 0, { "lineid": linechange.Index, "user": linechange.User, "data": linechange.Data });
        else if(linechange.Type === "drop")
            data = [];
        else
            data.splice(linechange.linenum - 1, 1);
    }

    return { "success": true, "description": "Finish Getting File !!!", "content": data };
}

module.exports = {createProject: createProject,
                  deleteProject: deleteProject,
                  deleteFile: deleteFile, 
                  addLineChange: addLineChange,
                  listFiles:listFiles,
                  getFile:getFile };