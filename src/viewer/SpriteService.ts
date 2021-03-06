/// <reference path="../../typings/index.d.ts" />

import * as THREE from "three";
import * as vd from "virtual-dom";

import {Observable} from "rxjs/Observable";
import {Subject} from "rxjs/Subject";

import "rxjs/add/operator/publishReplay";
import "rxjs/add/operator/scan";
import "rxjs/add/operator/startWith";

import {ISpriteAtlas, SpriteAlignment} from "../Viewer";

class SpriteAtlas implements ISpriteAtlas {
    private _image: HTMLImageElement;
    private _texture: THREE.Texture;
    private _json: ISprites;

    public set json(value: ISprites) {
        this._json = value;
    }

    public set image(value: HTMLImageElement) {
        this._image = value;
        this._texture = new THREE.Texture(this._image);
        this._texture.minFilter = THREE.NearestFilter;
    }

    public get loaded(): boolean {
        return !!(this._image && this._json);
    }

    public getGLSprite(name: string): THREE.Object3D {
        if (!this.loaded) {
            throw new Error("Sprites cannot be retrieved before the atlas is loaded.");
        }

        let definition: ISprite = this._json[name];

        if (!definition) {
            console.warn("Sprite with key" + name + "does not exist in sprite definition.");

            return new THREE.Object3D();
        }

        let texture: THREE.Texture = this._texture.clone();
        texture.needsUpdate = true;

        let width: number = this._image.width;
        let height: number = this._image.height;


        texture.offset.x = definition.x / width;
        texture.offset.y = (height - definition.y - definition.height) / height;
        texture.repeat.x = definition.width / width;
        texture.repeat.y = definition.height / height;

        let material: THREE.SpriteMaterial = new THREE.SpriteMaterial({ map: texture });

        return new THREE.Sprite(material);
    }

    public getDOMSprite(
        name: string,
        horizontalAlign?: SpriteAlignment,
        verticalAlign?: SpriteAlignment): vd.VNode {

        if (!this.loaded) {
            throw new Error("Sprites cannot be retrieved before the atlas is loaded.");
        }

        if (horizontalAlign == null) {
            horizontalAlign = SpriteAlignment.Start;
        }

        if (verticalAlign == null) {
            verticalAlign = SpriteAlignment.Start;
        }

        let definition: ISprite = this._json[name];

        if (!definition) {
            console.warn("Sprite with key" + name + "does not exist in sprite definition.");

            return vd.h("div", {}, []);
        }

        let clipTop: number = definition.y;
        let clipRigth: number = definition.x + definition.width;
        let clipBottom: number = definition.y + definition.height;
        let clipLeft: number = definition.x;

        let left: number = -definition.x;
        let top: number = -definition.y;

        let height: number = this._image.height;
        let width: number = this._image.width;

        switch (horizontalAlign) {
            case SpriteAlignment.Center:
                left -= definition.width / 2;
                break;
            case SpriteAlignment.End:
                left -= definition.width;
                break;
            case SpriteAlignment.Start:
                break;
            default:
                break;
        }

        switch (verticalAlign) {
            case SpriteAlignment.Center:
                top -= definition.height / 2;
                break;
            case SpriteAlignment.End:
                top -= definition.height;
                break;
            case SpriteAlignment.Start:
                break;
            default:
                break;
        }

        let pixelRatioInverse: number = 1 / definition.pixelRatio;

        clipTop *= pixelRatioInverse;
        clipRigth *= pixelRatioInverse;
        clipBottom *= pixelRatioInverse;
        clipLeft *= pixelRatioInverse;
        left *= pixelRatioInverse;
        top *= pixelRatioInverse;
        height *= pixelRatioInverse;
        width *= pixelRatioInverse;

        let properties: vd.createProperties = {
            src: this._image.src,
            style: {
                clip: `rect(${clipTop}px, ${clipRigth}px, ${clipBottom}px, ${clipLeft}px)`,
                height: `${height}px`,
                left: `${left}px`,
                position: "absolute",
                top: `${top}px`,
                width: `${width}px`,
            },
        };

        return vd.h("img", properties, []);
    }
}

interface ISprite {
    width: number;
    height: number;
    x: number;
    y: number;
    pixelRatio: number;
}

interface ISprites {
    [key: string]: ISprite;
}

interface ISpriteAtlasOperation {
    (atlas: SpriteAtlas): SpriteAtlas;
}

export class SpriteService {
    private _retina: boolean;

    private _spriteAtlasOperation$: Subject<ISpriteAtlasOperation>;
    private _spriteAtlas$: Observable<SpriteAtlas>;

    constructor(sprite?: string) {
        this._retina = window.devicePixelRatio > 1;

        this._spriteAtlasOperation$ = new Subject<ISpriteAtlasOperation>();

        this._spriteAtlas$ = this._spriteAtlasOperation$
            .startWith(
                (atlas: SpriteAtlas): SpriteAtlas => {
                    return atlas;
                })
            .scan<SpriteAtlas>(
                (atlas: SpriteAtlas, operation: ISpriteAtlasOperation): SpriteAtlas => {
                    return operation(atlas);
                },
                new SpriteAtlas())
            .publishReplay(1)
            .refCount();

        this._spriteAtlas$.subscribe();

        if (sprite == null) {
            return;
        }

        let format: string = this._retina ? "@2x" : "";

        let imageXmlHTTP: XMLHttpRequest = new XMLHttpRequest();
        imageXmlHTTP.open("GET", sprite + format + ".png", true);
        imageXmlHTTP.responseType = "arraybuffer";
        imageXmlHTTP.onload = () => {
            let image: HTMLImageElement = new Image();
            image.onload = () => {
                this._spriteAtlasOperation$.next(
                    (atlas: SpriteAtlas): SpriteAtlas => {
                        atlas.image = image;

                        return atlas;
                    });
            };

            let blob: Blob = new Blob([imageXmlHTTP.response]);
            image.src = window.URL.createObjectURL(blob);
        };

        imageXmlHTTP.send();

        let jsonXmlHTTP: XMLHttpRequest = new XMLHttpRequest();
        jsonXmlHTTP.open("GET", sprite + format + ".json", true);
        jsonXmlHTTP.responseType = "text";
        jsonXmlHTTP.onload = () => {
            let json: ISprites = <ISprites>JSON.parse(jsonXmlHTTP.response);

            this._spriteAtlasOperation$.next(
                    (atlas: SpriteAtlas): SpriteAtlas => {
                        atlas.json = json;

                        return atlas;
                    });
        };

        jsonXmlHTTP.send();
    }

    public get spriteAtlas$(): Observable<ISpriteAtlas> {
        return this._spriteAtlas$;
    }
}

export default SpriteService;
