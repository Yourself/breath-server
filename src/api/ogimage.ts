import { ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Request, Response } from 'express';
import { existsSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { getChartData, getCommonChartOptions } from '../utils/chart';
import { BreathServer } from './server';
import { QueryResponse } from './types';

const IMAGE_PATH = path.join(__dirname, '..', '..', 'data', 'ogimage.png');

const EXPIRE_S = 3600;

function useCachedFile(filename: string, expiration: number) {
  if (!existsSync(filename)) return false;
  const age = Date.now() - statSync(filename).mtimeMs;
  if (age > expiration * 1000) return false;
  return true;
}

export type OGImageConfig = {
  cacheFile?: string;
  expirationSeconds?: number;
  width?: number;
  height?: number;
};

export class OGImageGenerator {
  server: BreathServer;

  private _cacheFile: string;

  private _expireSec: number;

  private _width: number;

  private _height: number;

  constructor(server: BreathServer, config?: OGImageConfig) {
    this.server = server;
    this._cacheFile = config?.cacheFile ?? IMAGE_PATH;
    this._expireSec = config?.expirationSeconds ?? EXPIRE_S;
    this._width = config?.width ?? 480;
    this._height = config?.height ?? 270;
  }

  bind() {
    this.server.app.get('/api/ogimage', this.ogImageHandler.bind(this));
  }

  ogImageHandler(_: Request, res: Response) {
    if (!useCachedFile(IMAGE_PATH, this._expireSec)) {
      const points = Math.trunc(this._width / 2).toString();
      const devices = this.server.db.getDevices();
      const query = this.server.db.getReadings({ points }) as QueryResponse<Date>;
      const data = getChartData('atmp', devices, query);
      const configuration: ChartConfiguration = {
        type: 'line',
        data,
        options: getCommonChartOptions('atmp'),
      };
      const canvas = new ChartJSNodeCanvas({
        width: this._width,
        height: this._height,
        chartCallback: (chart) => {
          chart.defaults.responsive = true;
          chart.defaults.maintainAspectRatio = false;
        },
        plugins: {
          globalVariableLegacy: ['chartjs-adapter-date-fns'],
        },
      });
      const buffer = canvas.renderToBufferSync(configuration);
      writeFileSync(this._cacheFile, buffer, 'base64');
    }
    res.sendFile(IMAGE_PATH);
  }
}
