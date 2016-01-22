/// <reference path="../../node_modules/rx/ts/rx.all.d.ts" />

import * as rx from "rx";
import * as vd from "virtual-dom";

import {EdgeDirection} from "../Edge";
import {Node} from "../Graph";
import {Container, Navigator} from "../Viewer";

import {IUI} from "../UI";
import {IVNodeHash} from "../Render";

export class DirectionsUI implements IUI {
    private navigator: Navigator;
    private container: Container;
    private subscription: rx.IDisposable;
    private dirNames: {[dir: number]: string};
    private cssOffset: number;

    // { direction: angle }
    private staticArrows: {[dir: number]: number};

    constructor(container: Container, navigator: Navigator) {
        this.container = container;
        this.navigator = navigator;

        // cssOffset is a magic number in px
        this.cssOffset = 62;

        this.dirNames = {};
        this.dirNames[EdgeDirection.STEP_FORWARD] = "Forward";
        this.dirNames[EdgeDirection.STEP_BACKWARD] = "Backward";
        this.dirNames[EdgeDirection.STEP_LEFT] = "Left";
        this.dirNames[EdgeDirection.STEP_RIGHT] = "Right";

        this.staticArrows = {};
        this.staticArrows[EdgeDirection.STEP_FORWARD] = 0;
        this.staticArrows[EdgeDirection.STEP_BACKWARD] = 180;
        this.staticArrows[EdgeDirection.STEP_LEFT] = 3 * 180 / 2;
        this.staticArrows[EdgeDirection.STEP_RIGHT] = 180 / 2;

    }

    public activate(): void {
        this.subscription = this.navigator.stateService
            .currentNode$.map((node: Node): IVNodeHash => {

                let btns: vd.VNode[] = [];

                for (let edge of node.edges) {

                    let direction: EdgeDirection = edge.data.direction;
                    let name: string = this.dirNames[direction];

                    if (name == null) { continue; }

                    let angle: number = this.staticArrows[direction];
                    btns.push(this.createVNode(direction, angle));
                }

                return {name: "directions", vnode: this.getVNodeContainer(btns)};

            }).subscribe(this.container.domRenderer.render$);
    }

    public deactivate(): void {
        return;
    }

    private calcTranslation(angle: number): Array<number> {
        let radianAngle: number = (angle - 90) * Math.PI / 180;
        let x: number = Math.cos(radianAngle);
        let y: number = Math.sin(radianAngle);

        return [x, y];
    }

    private createVNode(direction: EdgeDirection, angle: number): vd.VNode {
        let translation: Array<number> = this.calcTranslation(angle);
        let translationWithOffsetX: number = this.cssOffset * translation[0];
        let translationWithOffsetY: number = this.cssOffset * translation[1];

        let dropShadowOffset: number = 3; // px
        let dropShadowTranslatedY: number = -dropShadowOffset * translation[1];
        let dropShadowTranslatedX: number = dropShadowOffset * translation[0];
        let filterValue: string = `drop-shadow(${dropShadowTranslatedX}px ${dropShadowTranslatedY}px 3px rgba(0,0,0,0.8))`;

        let style: any = {
            "-webkit-filter": filterValue,
            filter: filterValue,
            transform: `translate(${translationWithOffsetX}px, ${translationWithOffsetY}px) rotate(${angle}deg)`,
        };

        return vd.h(`div.DirectionsArrow.`,
                    {
                        onclick: (ev: Event): void => { this.navigator.moveDir(direction).first().subscribe(); },
                        style: style,
                    },
                    []);
    }

    private getVNodeContainer(children: any): any {
        // todo: change the rotateX value for panoramas
        let style: any = {
            transform: "perspective(375px) rotateX(65deg) rotateZ(0deg)"
        };

        return vd.h("div.Directions", {style: style}, children);
    }
}

export default DirectionsUI;