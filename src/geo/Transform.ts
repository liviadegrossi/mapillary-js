/// <reference path="../../typings/index.d.ts" />

import * as THREE from "three";

import {IAPINavImIm, IGPano} from "../API";

/**
 * @class Transform
 *
 * @classdesc Class used for calculating coordinate transformations
 * and projections.
 */
export class Transform {
    private _width: number;
    private _height: number;
    private _focal: number;
    private _orientation: number;
    private _scale: number;
    private _basicAspect: number;

    private _gpano: IGPano;

    private _rt: THREE.Matrix4;
    private _srt: THREE.Matrix4;

    /**
     * Create a new transform instance.
     * @param {IAPINavImIm} apiNavImIm - Node properties.
     * @param {HTMLImageElement} image - Node image.
     * @param {Array<number>} translation - Node translation vector in three dimensions.
     */
    constructor(apiNavImIm: IAPINavImIm, image: HTMLImageElement, translation: number[]) {
        this._orientation = this._getValue(apiNavImIm.orientation, 1);

        let imageWidth: number = image != null ? image.width : 4;
        let imageHeight: number = image != null ? image.height : 3;
        let keepOrientation: boolean = this._orientation < 5;

        this._width = this._getValue(apiNavImIm.width, keepOrientation ? imageWidth : imageHeight);
        this._height = this._getValue(apiNavImIm.height, keepOrientation ? imageHeight : imageWidth);
        this._basicAspect = keepOrientation ?
            this._width / this._height :
            this._height / this._width;

        this._focal = this._getValue(apiNavImIm.cfocal, 1);
        this._scale = this._getValue(apiNavImIm.atomic_scale, 0);

        this._gpano = apiNavImIm.gpano ? apiNavImIm.gpano : null;

        this._rt = this._getRt(apiNavImIm.rotation, translation);
        this._srt = this._getSrt(this._rt, this._scale);
    }

    /**
     * Get basic aspect.
     * @returns {number} The orientation adjusted aspect ratio.
     */
    public get basicAspect(): number {
        return this._basicAspect;
    }

    /**
     * Get focal.
     * @returns {number} The node focal length.
     */
    public get focal(): number {
        return this._focal;
    }

    /**
     * Get gpano.
     * @returns {number} The node gpano information.
     */
    public get gpano(): IGPano {
        return this._gpano;
    }

    /**
     * Get height.
     * @returns {number} The orientation adjusted image height.
     */
    public get height(): number {
        return this._height;
    }

    /**
     * Get orientation.
     * @returns {number} The image orientation.
     */
    public get orientation(): number {
        return this._orientation;
    }

    /**
     * Get rt.
     * @returns {THREE.Matrix4} The extrinsic camera matrix.
     */
    public get rt(): THREE.Matrix4 {
        return this._rt;
    }

    /**
     * Get srt.
     * @returns {THREE.Matrix4} The scaled extrinsic camera matrix.
     */
    public get srt(): THREE.Matrix4 {
        return this._srt;
    }

    /**
     * Get scale.
     * @returns {number} The node atomic reconstruction scale.
     */
    public get scale(): number {
        return this._scale;
    }

    /**
     * Get width.
     * @returns {number} The orientation adjusted image width.
     */
    public get width(): number {
        return this._width;
    }

    /**
     * Unproject SfM coordinates to a 3D world coordiantes.
     *
     * @param {number} x - SfM x-coordinate.
     * @param {number} y - SfM y-coordinate.
     * @param {number} depth - Depth to unproject 3D coordinate from camera center.
     * @returns {THREE.Vector3} 3D world coordinate.
     */
    public pixelToVertex(x: number, y: number, depth: number): THREE.Vector3 {
        let v: THREE.Vector4 = new THREE.Vector4(
            x / this._focal * depth,
            y / this._focal * depth,
            depth,
            1);

        v.applyMatrix4(new THREE.Matrix4().getInverse(this._rt));

        return new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
    }

    /**
     * Calculate the up vector for the node transform.
     *
     * @returns {THREE.Vector3} Normalized and orientation adjusted up vector.
     */
    public upVector(): THREE.Vector3 {
        let rte: Float32Array = this._rt.elements;

        switch (this._orientation) {
            case 1:
                return new THREE.Vector3(-rte[1], -rte[5], -rte[9]);
            case 3:
                return new THREE.Vector3(rte[1],  rte[5],  rte[9]);
            case 6:
                return new THREE.Vector3(-rte[0], -rte[4], -rte[8]);
            case 8:
                return new THREE.Vector3(rte[0],  rte[4],  rte[8]);
            default:
                return new THREE.Vector3(-rte[1], -rte[5], -rte[9]);
        }
    }

    /**
     * Calculate projector matrix for projecting 3D points to pixels.
     *
     * @returns {THREE.Matrix4} Projection matrix for 3D point to pixel calculations.
     */
    public projectorMatrix(): THREE.Matrix4 {
        let projector: THREE.Matrix4 = this._normalizedToTextureMatrix();

        let f: number = this._focal;
        let projection: THREE.Matrix4 = new THREE.Matrix4().set(
            f, 0, 0, 0,
            0, f, 0, 0,
            0, 0, 0, 0,
            0, 0, 1, 0
        );

        projector.multiply(projection);
        projector.multiply(this._rt);

        return projector;
    }

    /**
     * Project 3D world coordinates to basic coordinates.
     *
     * @param {Array<number>} point - 3D world coordinates.
     * @return {Array<number>} 2D basic coordinates.
     */
    public projectBasic(point: number[]): number[] {
        let sfm: number[] = this.projectSfM(point);
        return this._sfmToBasic(sfm);
    }

    /**
     * Unproject basic coordinates to a 3D world coordinates.
     *
     * @param {Array<number>} pixel - 2D basic coordinates.
     * @param {Array<number>} distance - Depth to unproject from camera center.
     * @returns {Array<number>} Unprojected 3D world coordinate.
     */
    public unprojectBasic(pixel: number[], distance: number): number[] {
        let sfm: number[] = this._basicToSfm(pixel);
        return this.unprojectSfM(sfm, distance);
    }

    /**
     * Project 3D world coordinates to SfM coordinates.
     *
     * @param {Array<number>} point - 3D world coordinates.
     * @return {Array<number>} 2D SfM coordinates.
     */
    public projectSfM(point: number[]): number[] {
        let v: THREE.Vector4 = new THREE.Vector4(point[0], point[1], point[2], 1);
        v.applyMatrix4(this._rt);
        return this._bearingToPixel([v.x, v.y, v.z]);
    }

    /**
     * Unproject SfM coordinates to a 3D world coordinates.
     *
     * @param {Array<number>} pixel - 2D SfM coordinates.
     * @param {Array<number>} distance - Depth to unproject from camera center.
     * @returns {Array<number>} Unprojected 3D world coordinate.
     */
    public unprojectSfM(pixel: number[], distance: number): number[] {
        let bearing: number[] = this._pixelToBearing(pixel);
        let v: THREE.Vector4 = new THREE.Vector4(
            distance * bearing[0],
            distance * bearing[1],
            distance * bearing[2],
            1);
        v.applyMatrix4(new THREE.Matrix4().getInverse(this._rt));
        return [v.x / v.w, v.y / v.w, v.z / v.w];
    }

    /**
     * Transform SfM coordinates to 3D cartesian on the unit sphere.
     *
     * @param {Array<number>} pixel - 2D SfM coordinates.
     * @returns {Array<number>} 3D cartesian coordinates on the unit sphere.
     */
    private _pixelToBearing(pixel: number[]): number[] {
        if (this._fullPano()) {
            let lon: number = pixel[0] * 2 * Math.PI;
            let lat: number = -pixel[1] * 2 * Math.PI;
            let x: number = Math.cos(lat) * Math.sin(lon);
            let y: number = -Math.sin(lat);
            let z: number = Math.cos(lat) * Math.cos(lon);
            return [x, y, z];
        } else if (this._gpano) {
            let size: number = Math.max(this.gpano.CroppedAreaImageWidthPixels, this.gpano.CroppedAreaImageHeightPixels);
            let fullPanoPixel: number[] = [
                pixel[0] * size + this.gpano.CroppedAreaImageWidthPixels / 2 + this.gpano.CroppedAreaLeftPixels,
                pixel[1] * size + this.gpano.CroppedAreaImageHeightPixels / 2 + this.gpano.CroppedAreaTopPixels,
            ];
            let lon: number = 2 * Math.PI * (fullPanoPixel[0] / this.gpano.FullPanoWidthPixels - 0.5);
            let lat: number = - Math.PI * (fullPanoPixel[1] / this.gpano.FullPanoHeightPixels - 0.5);
            let x: number = Math.cos(lat) * Math.sin(lon);
            let y: number = -Math.sin(lat);
            let z: number = Math.cos(lat) * Math.cos(lon);
            return [x, y, z];
        } else {
            let v: THREE.Vector3 = new THREE.Vector3(pixel[0], pixel[1], this._focal);
            v.normalize();
            return [v.x, v.y, v.z];
        }
    }

    /**
     * Transform 3D cartesian on the unit sphere to SfM coordinates.
     *
     * @param {Array<number>} 3D cartesian coordinates on the unit sphere.
     * @returns {Array<number>} pixel - 2D SfM coordinates.
     */
    private _bearingToPixel(bearing: number[]): number[] {
        if (this._fullPano()) {
            let x: number = bearing[0];
            let y: number = bearing[1];
            let z: number = bearing[2];
            let lon: number = Math.atan2(x, z);
            let lat: number = Math.atan2(-y, Math.sqrt(x * x + z * z));
            return [lon / (2 * Math.PI), -lat / (2 * Math.PI)];
        } else if (this._gpano) {
            let x: number = bearing[0];
            let y: number = bearing[1];
            let z: number = bearing[2];
            let lon: number = Math.atan2(x, z);
            let lat: number = Math.atan2(-y, Math.sqrt(x * x + z * z));
            let fullPanoPixel: number[] = [
                (lon / (2 * Math.PI) + 0.5) * this.gpano.FullPanoWidthPixels,
                (- lat / Math.PI + 0.5) * this.gpano.FullPanoHeightPixels,
            ];
            let size: number = Math.max(this.gpano.CroppedAreaImageWidthPixels, this.gpano.CroppedAreaImageHeightPixels);
            return [
                (fullPanoPixel[0] - this.gpano.CroppedAreaLeftPixels - this.gpano.CroppedAreaImageWidthPixels / 2) / size,
                (fullPanoPixel[1] - this.gpano.CroppedAreaTopPixels - this.gpano.CroppedAreaImageHeightPixels / 2) / size,
            ];
        } else {
            return [
                bearing[0] * this._focal / bearing[2],
                bearing[1] * this._focal / bearing[2],
            ];
        }
    }

    /**
     * Convert basic coordinates to SfM coordinates.
     *
     * @param {Array<number>} point - 2D basic coordinates.
     * @returns {Array<number>} 2D SfM coordinates.
     */
    private _basicToSfm(point: number[]): number[] {
        let rotatedX: number;
        let rotatedY: number;

        switch (this._orientation) {
            case 1:
                rotatedX = point[0];
                rotatedY = point[1];
                break;
            case 3:
                rotatedX = 1 - point[0];
                rotatedY = 1 - point[1];
                break;
            case 6:
                rotatedX = point[1];
                rotatedY = 1 - point[0];
                break;
            case 8:
                rotatedX = 1 - point[1];
                rotatedY = point[0];
                break;
            default:
                rotatedX = point[0];
                rotatedY = point[1];
                break;
        }

        let w: number = this._width;
        let h: number = this._height;
        let s: number = Math.max(w, h);
        let sfmX: number = rotatedX * w / s - w / s / 2;
        let sfmY: number = rotatedY * h / s - h / s / 2;

        return [sfmX, sfmY];
    }

    /**
     * Convert SfM coordinates to basic coordinates.
     *
     * @param {Array<number>} point - 2D SfM coordinates.
     * @returns {Array<number>} 2D basic coordinates.
     */
    private _sfmToBasic(point: number[]): number[] {
        let w: number = this._width;
        let h: number = this._height;
        let s: number = Math.max(w, h);
        let rotatedX: number = (point[0] + w / s / 2) / w * s;
        let rotatedY: number = (point[1] + h / s / 2) / h * s;

        let basicX: number;
        let basicY: number;

        switch (this._orientation) {
            case 1:
                basicX = rotatedX;
                basicY = rotatedY;
                break;
            case 3:
                basicX = 1 - rotatedX;
                basicY = 1 - rotatedY;
                break;
            case 6:
                basicX = 1 - rotatedY;
                basicY = rotatedX;
                break;
            case 8:
                basicX = rotatedY;
                basicY = 1 - rotatedX;
                break;
            default:
                basicX = rotatedX;
                basicY = rotatedY;
                break;
        }

        return [basicX, basicY];
    }

    /**
     * Determines if the gpano information indicates a full panorama.
     *
     * @returns {boolean} Value determining if the gpano information indicates
     * a full panorama.
     */
    private _fullPano(): boolean {
        return this.gpano != null &&
            this.gpano.CroppedAreaLeftPixels === 0 &&
            this.gpano.CroppedAreaTopPixels === 0 &&
            this.gpano.CroppedAreaImageWidthPixels === this.gpano.FullPanoWidthPixels &&
            this.gpano.CroppedAreaImageHeightPixels === this.gpano.FullPanoHeightPixels;
    }

    /**
     * Checks a value and fallbacks if it is null.
     *
     * @param {number} value - Value to check.
     * @param {number} fallback - Value to fall back to.
     * @returns {number} The value or its fallback value if it is not defined or negative.
     */
    private _getValue(value: number, fallback: number): number {
        return value != null && value > 0 ? value : fallback;
    }

    /**
     * Calculates the extrinsic camera matrix [ R | t ].
     *
     * @param {Array<number>} rotation - Rotation vector in angle axis representation.
     * @param {Array<number>} translation - Translation vector.
     * @returns {THREE.Matrix4} Extrisic camera matrix.
     */
    private _getRt(rotation: number[], translation: number[]): THREE.Matrix4 {
        let axis: THREE.Vector3 = new THREE.Vector3(rotation[0], rotation[1], rotation[2]);
        let angle: number = axis.length();
        axis.normalize();

        let rt: THREE.Matrix4 = new THREE.Matrix4();
        rt.makeRotationAxis(axis, angle);
        rt.setPosition(
            new THREE.Vector3(
                translation[0],
                translation[1],
                translation[2]));

        return rt;
    }

    /**
     * Calculates the scaled extrinsic camera matrix scale * [ R | t ].
     *
     * @param {THREE.Matrix4} rt - Extrisic camera matrix.
     * @param {number} scale - Scale factor.
     * @returns {THREE.Matrix4} Scaled extrisic camera matrix.
     */
    private _getSrt(rt: THREE.Matrix4, scale: number): THREE.Matrix4 {
        let srt: THREE.Matrix4 = rt.clone();
        let elements: Float32Array = srt.elements;

        elements[12] = scale * elements[12];
        elements[13] = scale * elements[13];
        elements[14] = scale * elements[14];

        srt.scale(new THREE.Vector3(scale, scale, scale));

        return srt;
    }

    /**
     * Calculate a transformation matrix from normalized coordinates for
     * texture coordinates.
     *
     * @returns {THREE.Matrix4} Normalized coordinates to texture coordinates
     * transformation matrix.
     */
    private _normalizedToTextureMatrix(): THREE.Matrix4 {
        let size: number = Math.max(this._width, this._height);
        let w: number = size / this._width;
        let h: number = size / this._height;
        switch (this._orientation) {
            case 1:
                return new THREE.Matrix4().set(w, 0, 0, 0.5, 0, -h, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
            case 3:
                return new THREE.Matrix4().set(-w, 0, 0, 0.5, 0, h, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
            case 6:
                return new THREE.Matrix4().set( 0, -h, 0, 0.5, -w, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
            case 8:
                return new THREE.Matrix4().set(0, h, 0, 0.5, w, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
            default:
                return new THREE.Matrix4().set(w, 0, 0, 0.5, 0, -h, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
        }
    }
}
