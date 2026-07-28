import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const getPathsConfig = (): any => {
  const configFilePath = path.join(__dirname, '../../paths_config.json');
  return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
};

const getDefaultsConfig = (): any => {
  const configFilePath = path.join(__dirname, '../../defaults_config.json');
  return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
};

const readScriptNames = (dirPath: string, res: Response) => {
  fs.readdir(dirPath, function(err, files) {
    if (err) {
      return res.json([]);
    }
    // Only .json files are methods; anything else in the directory (editor
    // backups, hidden files) must not appear as a selectable option.
    const fileArray = files
      .filter(file => file.endsWith('.json'))
      .map(file => path.parse(file).name);
    // res.json, not res.send: these names come off the filesystem, and a file
    // named after markup would be a stored XSS the moment anything renders this
    // response as a document (CodeQL js/stored-xss). res.json pins the body to
    // application/json, which a browser will not sniff as HTML. The bytes on
    // the wire are unchanged -- Express already JSON-encoded the array.
    res.json(fileArray);
  });
};

const getLayer2Scripts = (req: Request, res: Response) => {
  try {
    readScriptNames(getPathsConfig().layer2_path, res);
  } catch(error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getLayer3Scripts = (req: Request, res: Response) => {
  try {
    readScriptNames(getPathsConfig().layer3_path, res);
  } catch(error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Returns defaults_config.json so the frontend can auto-select the configured
// default layer2 / layer3 script when multiple options exist.
const getDefaults = (req: Request, res: Response) => {
  try {
    res.json(getDefaultsConfig());
  } catch(error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getLayer2Scripts, getLayer3Scripts, getDefaults };
