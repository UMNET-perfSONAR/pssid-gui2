import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const getPathsConfig = (): any => {
  const configFilePath = path.join(__dirname, '../../paths_config.json');
  return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
};

const readScriptNames = (dirPath: string, res: Response) => {
  fs.readdir(dirPath, function(err, files) {
    if (err) {
      return res.send([]);
    }
    const fileArray = files.map(file => path.parse(file).name);
    res.send(fileArray);
  });
};

const getScripts = (req: Request, res: Response) => {
  try {
    readScriptNames(getPathsConfig().scripts_path, res);
  } catch(error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getScripts };
