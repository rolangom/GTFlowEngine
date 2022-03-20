import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import createStore from "./GTState";

const DUMMY_FUNC = (...args: any[]) => {};
const RESIZER_SIZE = 10;
const PORT_RADIUS = 6;
const PADDING_RIGHT = 50;
const PORT_LABEL_FONT_SIZE = 7;
const portCircleWidth = 2;
const RESIZER_BORDER_WIDTH = 1;
const BORDER_WIDTH = 5;
const HALF = 0.5;
const OPACITY_50 = HALF;
const OPACITY_75 = 0.75;
const OPACITY_25 = 0.25;
const DEFAULT_XY: [number, number] = [0, 0];
const X = 0;
const Y = 1;
const W = 0;
const H = 1;
const emptyObj = {};

const {
  useStore: useSVGStore,
  useSetValue: useSetSVG,
  useValue: useSVG,
} = createStore<SVGSVGElement | undefined>(undefined);
const {
  useStore: useSelectedItemStore,
  useSetValue: useSetSelectedItem,
  useValue: useSelectedItem,
} = createStore<string | undefined>(undefined);

interface IMaybeProps {
  visible: boolean;
  children: React.ReactNode;
}

function Maybe(props: IMaybeProps) {
  return props.visible ? <>{props.children}</> : null;
}

function getMouseEventPosition(
  event: React.MouseEvent<any, MouseEvent> | MouseEvent,
  svg: SVGSVGElement | undefined,
  maybePt: DOMPoint | undefined
): [number, number, DOMPoint | undefined] {
  if (!svg) return [event.clientX, event.clientY, undefined];
  const pt = maybePt || svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  // console.log(svg.getScreenCTM())
  const newPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
  return [newPt.x, newPt.y, newPt];
}

function startDrag(
  event: React.MouseEvent<any, MouseEvent>,
  initialPosition: [number, number],
  setPosition: React.Dispatch<React.SetStateAction<[number, number]>>,
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>,
  svg: SVGSVGElement | undefined
) {
  // event.preventDefault();
  setIsDragging(true);
  const [clientX, clientY, pt] = getMouseEventPosition(event, svg, undefined);
  const [x, y] = initialPosition;
  const offsetX = clientX - x;
  const offsetY = clientY - y;

  function move(x: number, y: number) {
    setPosition([x - offsetX, y - offsetY]);
  }

  function mousemove(event: MouseEvent) {
    const [clientX, clientY, _pt] = getMouseEventPosition(event, svg, pt);
    move(clientX, clientY);
  }

  function mouseup(lEvent: MouseEvent) {
    const [clientX, clientY, _pt] = getMouseEventPosition(lEvent, svg, pt);
    move(clientX, clientY);
    document.removeEventListener("pointermove", mousemove);
    document.removeEventListener("pointerup", mouseup);
    setIsDragging(false);
    lEvent.preventDefault();
    lEvent.stopPropagation();
  }

  setPosition([x, y]);
  document.addEventListener("pointermove", mousemove);
  document.addEventListener("pointerup", mouseup);
  // event.preventDefault();
  // event.stopPropagation();
}

interface INodePortProps {
  id: string;
  // renderType: 'string'|'function';
  renderLabel?:(p: { x: number, y: number }) => React.ReactElement;
  label?: string;
  type: "input" | "output";
  position: [number, number];
  required?: boolean;
}

interface IPortAddress {
  node: string;
  port: string;
}

interface IPortAddressExtra {
  node: string;
  port: INodePortProps;
}

interface INodeConnector {
  id: string;
  from: IPortAddress;
  to: IPortAddress;
}

interface INodeProps extends Record<string, any> {
  id: string;
  position: [number, number];
  size: [number, number];
  text: string;
  resizable?: boolean;
  ports: INodePortProps[];
}

type IDir = "top" | "right" | "bottom" | "left";

type DraggingPortPos = [nodeId: string, portId: string, at: number]; // , event: PIXI.InteractionEvent
type DraggingPortPosFromTo =
  | {
      from: DraggingPortPos | undefined;
      to: DraggingPortPos | undefined;
    }
  | undefined;

function getDir(position: [number, number]): IDir {
  const [x, y] = position;
  if (x === 0) {
    return "left";
  } else if (y === 0) {
    return "top";
  } else if (y === 1) {
    return "bottom";
  } else {
    return "right";
  }
}

function getConnectorPortPosDir(
  item: INodeProps,
  portId: string
): [x: number, y: number, dir: IDir] {
  const port = item.ports.find((it) => it.id === portId)!;
  const x = item.position[X] + item.size[W] * port.position[X];
  const y = item.position[Y] + item.size[H] * port.position[Y];
  const dir = getDir(port.position);
  return [x, y, dir];
}

interface IPortCircle {
  item: INodePortProps;
  nodeId: string;
  x: number;
  y: number;
  currentDrawingPortAddress?: IPortAddressExtra;
  setDraggingFromTo: React.Dispatch<
    React.SetStateAction<DraggingPortPosFromTo>
  >;
  setDragginPos: React.Dispatch<React.SetStateAction<[number, number]>>;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
}

const PortCircle = React.memo((props: IPortCircle) => {
  const {
    item,
    nodeId,
    setDraggingFromTo,
    setDragginPos,
    setIsDragging,
    x,
    y,
    currentDrawingPortAddress,
  } = props;
  const [isHoverWhileDragging, setIsHoverWhileDragging] = useState(false);

  const svg = useSVG();
  const circleRef = useRef<SVGCircleElement | undefined>(undefined);

  function setCurrentPoint(ev: boolean) {
    const val = ev
      ? ([nodeId, item.id, Date.now()] as DraggingPortPos)
      : undefined;
    setIsHoverWhileDragging(ev);
    setDraggingFromTo((fromTo: DraggingPortPosFromTo) => ({
      from: item.type === "input" ? val : fromTo?.from,
      to: item.type === "output" ? val : fromTo?.to,
    }));
  }

  const onMouseDown = useCallback(
    (ev: React.MouseEvent) => {
      setCurrentPoint(true);
      function localSetIsDragging(pIsDragging: boolean) {
        setIsDragging(pIsDragging);
        if (!pIsDragging) {
          setDraggingFromTo(undefined);
        }
      }
      startDrag(
        ev,
        [x, y],
        setDragginPos,
        // @ts-ignore
        localSetIsDragging,
        svg
      );
    },
    [nodeId, x, y, svg]
  );

  const onMouseEnterRef = useRef((ev: MouseEvent) => setCurrentPoint(true));
  const onMouseLeaveRef = useRef((ev: MouseEvent) => setCurrentPoint(false));

  useEffect(() => {
    if (
      currentDrawingPortAddress &&
      circleRef.current &&
      currentDrawingPortAddress.node !== nodeId &&
      currentDrawingPortAddress.port.id !== item.id &&
      currentDrawingPortAddress.port.type !== item.type
    ) {
      // console.log('addingListeners', nodeId, item.id);
      circleRef.current.addEventListener(
        "pointerover",
        onMouseEnterRef.current
      );
      circleRef.current.addEventListener("pointerout", onMouseLeaveRef.current);
    } else {
      if (circleRef.current) {
        circleRef.current.removeEventListener(
          "pointerover",
          onMouseEnterRef.current
        );
        circleRef.current.removeEventListener(
          "pointerout",
          onMouseLeaveRef.current
        );
        setIsHoverWhileDragging(false);
      }
    }
  }, [currentDrawingPortAddress, circleRef, nodeId, item]);

  return (
    <circle
      // @ts-ignore
      ref={circleRef}
      cx={x}
      cy={y}
      r={isHoverWhileDragging ? PORT_RADIUS * 1.15 : PORT_RADIUS}
      fill="white"
      stroke="gray"
      strokeWidth={2}
      onPointerDown={onMouseDown}
      name={item.id}
    />
  );
});

interface IPortProps {
  item: INodePortProps;
  nodeId: string;
  nodePos: [number, number];
  size: [number, number];
  currentDrawingPortAddress?: IPortAddressExtra;
  setDraggingFromTo: React.Dispatch<
    React.SetStateAction<DraggingPortPosFromTo>
  >;
}

function Port(props: IPortProps) {
  const {
    item,
    size,
    nodeId,
    nodePos,
    setDraggingFromTo,
    currentDrawingPortAddress,
  } = props;
  const width = size[W],
    height = size[H];
  const x = nodePos[X] + width * item.position[X];
  const y = nodePos[Y] + height * item.position[Y];

  const dir = getDir(item.position);

  const [isDragging, setIsDragging] = useState(false);
  const [draggingPos, setDragginPos] = useState(DEFAULT_XY);

  const origin: [number, number] = [x, y];

  const textX =
    dir === "right"
      ? x - portCircleWidth - PORT_RADIUS
      : dir === "left"
      ? x + portCircleWidth + PORT_RADIUS
      : x;
  const textAlign =
    dir === "right" ? "end" : dir === "left" ? "start" : "center";
  const textAnchor =
    dir === "right" ? "end" : dir === "left" ? "start" : "middle";

  const textY =
    dir === "top" || dir === "bottom"
      ? y - portCircleWidth - PORT_RADIUS - PORT_LABEL_FONT_SIZE * HALF
      : y + PORT_LABEL_FONT_SIZE * HALF * HALF;
  return (
    <>
      <PortCircle
        x={x}
        y={y}
        item={item}
        nodeId={nodeId}
        setDragginPos={setDragginPos}
        setIsDragging={setIsDragging}
        setDraggingFromTo={setDraggingFromTo}
        currentDrawingPortAddress={currentDrawingPortAddress}
      />
      <Maybe visible={!!item.label}>
        <text
          x={textX}
          y={textY}
          style={{ fontSize: PORT_LABEL_FONT_SIZE, textAlign, textAnchor }}
          fill="gray"
          pointerEvents="none"
        >
          {item.label}
        </text>
      </Maybe>
      <Maybe visible={!!item.renderLabel}>
        {item?.renderLabel?.({ x: textX, y: textY })}
      </Maybe>
      <Maybe visible={isDragging}>
        <MaybeDrawDraggingLine origin={origin} draggingPos={draggingPos} />
      </Maybe>
    </>
  );
}

interface INodeElementProps extends INodeProps {
  onPositionChange(p: [number, number]): void;
  onSizeChange(size: [number, number]): void;
  isShadow?: boolean;
  setDraggingFromTo: React.Dispatch<
    React.SetStateAction<DraggingPortPosFromTo>
  >;
  children?: React.ReactNode;
  currentDrawingPortAddress?: IPortAddressExtra;
  setIsInteracting: React.Dispatch<React.SetStateAction<boolean>>;
}

function Node(props: INodeElementProps) {
  const { setIsInteracting } = props;
  const [position, setPosition] = useState(props.position);
  const [size, setSize] = useState(props.size);
  const width = size[W],
    height = size[H];
  const x = position[X],
    y = position[Y];
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [draggingStartPosition, setDraggingStartPosition] = useState<
    [number, number] | null
  >(null);
  const svg = useSVG();
  const [selectedItem, setSelectedItem] = useSelectedItemStore();
  const { id } = props;
  // const onClick: React.MouseEventHandler<SVGPathElement> = useCallback(
  //   (ev) => {
  //     // ev.stopPropagation();
  //     setSelectedItem(id);
  //   },
  //   [id]
  // );
  const className = useMemo(
    () => (selectedItem === id ? "item-selected" : undefined),
    [selectedItem, id]
  );

  const onMouseSizeDown: React.MouseEventHandler<SVGRectElement> = useCallback(
    (ev) => {
      setDraggingStartPosition(position);

      function handlePositionToSize([rsx, rsy]: [number, number]) {
        const newWidth = rsx - x + RESIZER_SIZE + RESIZER_BORDER_WIDTH;
        const newHeight = rsy - y + RESIZER_SIZE + RESIZER_BORDER_WIDTH;
        setSize([newWidth, newHeight]);
      }

      const resizerX = x + width - RESIZER_SIZE - RESIZER_BORDER_WIDTH;
      const resizerY = y + height - RESIZER_SIZE - RESIZER_BORDER_WIDTH;
      startDrag(
        ev,
        [resizerX, resizerY],
        // @ts-ignore
        handlePositionToSize,
        setIsResizing,
        svg
      );
    },
    [position, size, svg, id]
  );

  const onMousePositionDown: React.MouseEventHandler<SVGRectElement> =
    useCallback(
      (ev) => {
        console.log("onMouseSizeDown", id);
        setSelectedItem(id);
        if (!isResizing) {
          setDraggingStartPosition(position);
          // @ts-ignore
          startDrag(ev, position, setPosition, setIsDragging, svg);
        }
      },
      [position, isResizing, svg, id]
    );

  useEffect(() => {
    if (!isDragging) {
      props.onPositionChange(position);
    }
  }, [isDragging, position]);
  useEffect(() => {
    if (!isResizing) {
      props.onSizeChange(size);
    }
  }, [isResizing, size]);

  useEffect(() => {
    if (isResizing || isDragging) {
      setIsInteracting(true);
    } else {
      setIsInteracting(false);
    }
  }, [isDragging, isResizing]);

  const opacity = isDragging || isResizing ? 0.5 : props.isShadow ? 0.25 : 1;

  const portElements = useMemo(
    () =>
      props.ports.map((it) => (
        <Port
          key={it.id}
          item={it}
          size={size}
          nodeId={props.id}
          nodePos={position}
          setDraggingFromTo={props.setDraggingFromTo}
          currentDrawingPortAddress={props.currentDrawingPortAddress}
        />
      )),
    [
      size,
      position,
      props.ports,
      props.id,
      props.setDraggingFromTo,
      props.currentDrawingPortAddress,
    ]
  );

  // const
  return (
    <>
      <g
        // x={x} y={y}
        // width={portCircleWidth + portRadius + width + resizerSize + resizerStrokeWidth + paddingRight}
        // height={portCircleWidth + portRadius + height + resizerSize + resizerStrokeWidth}
        opacity={opacity}
      >
        <rect
          // x={portCircleWidth + portRadius} y={portCircleWidth + portRadius}
          // className="css-filter"
          x={x}
          y={y}
          width={width}
          height={height}
          rx={10}
          ry={10}
          fill="white"
          opacity={0.65}
          stroke="lightgray"
          strokeWidth={5}
          onPointerDown={onMousePositionDown}
          // onClick={onClick}
          className={className}
          // onMouseDown={onMousePositionDown}
        />
        <text
          x={x + width * 0.5}
          y={y + height * 0.5}
          textAnchor="middle"
          fill="gray"
          pointerEvents="none"
        >
          {props.text}
        </text>
        {portElements}
        {/* {props.children} */}
        <Maybe visible={!!props.resizable}>
          <rect
            x={x + width}
            y={y + height}
            width={RESIZER_SIZE}
            height={RESIZER_SIZE}
            fill="white"
            stroke="black"
            strokeWidth={RESIZER_BORDER_WIDTH}
            opacity={0.75}
            onPointerDown={onMouseSizeDown}
            // onMouseDown={onMouseSizeDown}
          />
        </Maybe>
      </g>
      {(isDragging || isResizing) && draggingStartPosition && (
        <Node
          id={props.id + "-shadow"}
          position={draggingStartPosition}
          size={size}
          resizable={props.resizable}
          text={props.text}
          onPositionChange={DUMMY_FUNC}
          onSizeChange={DUMMY_FUNC}
          isShadow={true}
          ports={props.ports}
          setDraggingFromTo={DUMMY_FUNC}
          setIsInteracting={DUMMY_FUNC}
        />
      )}
    </>
  );
}

const defaultWidth = 200;
const defaultHeight = 50;
const defaultElements: INodeProps[] = [
  {
    id: "0",
    position: [50, 50],
    size: [defaultWidth, defaultHeight],
    text: "Content 0",
    resizable: true,
    ports: [
      {
        id: "0pi0",
        type: "input",
        position: [1 / 3, 0],
        label: "input_label",
      },
      {
        id: "0pi1",
        type: "input",
        position: [2 / 3, 0],
        label: "input_label",
      },
      {
        id: "0po0",
        type: "output",
        position: [0.5, 1],
        label: "output_label",
      },
    ],
  },
  {
    id: "1",
    position: [150, 150],
    size: [defaultWidth, defaultHeight],
    text: "Content 1",
    ports: [
      {
        id: "1pi0",
        type: "input",
        position: [0, 1 / 3],
        resizable: true,
        // label: "input_label0",
        renderLabel: ({ x, y }) => (
          <foreignObject x={x} y={y-12.5} width={50} height={25}>
            <input placeholder="input" style={{ width: "50px"}} />
          </foreignObject>
        )
      },
      {
        id: "1pi1",
        type: "input",
        position: [0, 2 / 3],
        label: "input_label",
      },
      {
        id: "1po0",
        type: "output",
        position: [1, 0.5],
        // label: "output_label",
        renderLabel: ({ x, y }) => (
          <foreignObject x={x-50} y={y-12.5} width={50} height={25}>
            <input placeholder="input" style={{ width: "40px"}} />
          </foreignObject>
        )
      },
    ],
  },
  {
    id: "2",
    position: [250, 250],
    size: [defaultWidth, defaultHeight],
    text: "Content 2",
    ports: [
      {
        id: "2pi0",
        type: "input",
        position: [0, 1 / 3],
        label: "input_label",
      },
      {
        id: "2pi1",
        type: "input",
        position: [0, 2 / 3],
        label: "input_label",
      },
      {
        id: "2po0",
        type: "output",
        position: [1, 0.5],
        label: "output_label",
      },
    ],
  },
];

const defaultConnectors: INodeConnector[] = [
  {
    id: "conn0",
    from: {
      node: "0",
      port: "0po0",
    },
    to: {
      node: "1",
      port: "1pi0",
    },
  },
];

const emptyArr = [] as unknown[];

function arrayToRecords<T extends Record<string, any>>(
  list: T[],
  key: string
): Record<string, T> {
  return Object.values(list).reduce(
    (acc, it) => ({ ...acc, [it[key]]: it }),
    {} as Record<string, T>
  );
}

interface ConnectorsDrawerProps {
  connectors: INodeConnector[];
  elements: Record<string, INodeProps>;
}

const connTensionLen = 50;
function buildPortPath(
  pos: ReturnType<typeof getConnectorPortPosDir>
): [number, number, number, number] {
  const [x1, y1, dir] = pos;
  const x2 =
    dir === "left"
      ? x1 - connTensionLen
      : dir === "right"
      ? x1 + connTensionLen
      : x1;
  const y2 =
    dir === "top"
      ? y1 - connTensionLen
      : dir === "bottom"
      ? y1 + connTensionLen
      : y1;
  return [x1, y1, x2, y2];
}

function ConnectorPath(props: {
  conn: INodeConnector;
  elements: Record<string, INodeProps>;
}) {
  const { conn, elements } = props;
  const {
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort },
    id,
  } = conn;
  const fromNodeElem = elements[fromNode];
  const toNodeElem = elements[toNode];
  const posDirFromPort = getConnectorPortPosDir(fromNodeElem, fromPort);
  const posDirToPort = getConnectorPortPosDir(toNodeElem, toPort);
  const [p1x1, p1y1, p1x2, p1y2] = buildPortPath(posDirFromPort);
  const [p2x1, p2y1, p2x2, p2y2] = buildPortPath(posDirToPort);
  const data = `M ${p1x1} ${p1y1} C ${p1x2} ${p1y2}, ${p2x2} ${p2y2}, ${p2x1} ${p2y1}`;
  // const [filter, setFilter] = React.useState<string | undefined>(undefined);
  const [selectedItem, setSelectedItem] = useSelectedItemStore();
  const onClick: React.MouseEventHandler<SVGPathElement> = useCallback(
    (ev) => {
      ev.stopPropagation();
      console.log("ConnectorPath click", id);
      setSelectedItem(id);
    },
    [id]
  );
  const className = useMemo(
    () => (selectedItem === id ? "item-selected" : undefined),
    [selectedItem, id]
  );
  // console.log("selectedItem", selectedItem);
  return (
    <path
      d={data}
      stroke="orange"
      fill="transparent"
      strokeWidth={5}
      strokeLinecap="round"
      opacity={0.75}
      className={className}
      // filter={filter}
      onClick={onClick}
      // onM
    />
  );
}

function ConnectorsDrawer(props: ConnectorsDrawerProps) {
  const { connectors, elements } = props;
  const toRender = useMemo(
    () =>
      connectors.map((it) => (
        <ConnectorPath key={it.id} conn={it} elements={elements} />
      )),
    [connectors, elements]
  );
  return <>{toRender}</>;
}

interface IMaybeDrawDragginLineProps {
  // origin: DraggingPortPos | undefined,
  origin: [number, number];
  draggingPos: [number, number];
  // resetDrawing(): void,
}

const arrowSize = 10;

function MaybeDrawDraggingLine(props: IMaybeDrawDragginLineProps) {
  const { origin, draggingPos } = props;
  if (!origin) {
    return null;
  }
  const [x, y] = origin!;
  return (
    <line
      x1={x}
      x2={draggingPos[X]}
      y1={y}
      y2={draggingPos[Y]}
      stroke="orange"
      strokeWidth="5"
      opacity={0.5}
      strokeLinecap="round"
    />
  );
}

function getDraggingOrigin(it: DraggingPortPosFromTo) {
  // @ts-ignore
  const sortedAsc = Object.values(it ?? (emptyObj as DraggingPortPosFromTo))
    .filter(Boolean)
    .sort(
      (a, b) => (a?.[2] ?? Number.MAX_VALUE) - (b?.[2] ?? Number.MAX_VALUE)
    );
  return sortedAsc?.[0];
}

interface ISVGContainerProps {
  width: string | number;
  height: string | number;
  isInteracting: boolean;
}

interface IViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function SVGContainer(props: React.PropsWithChildren<ISVGContainerProps>) {
  const { width, height, children, isInteracting } = props;
  const svgImageRef = useRef<SVGSVGElement | undefined>(undefined);
  const svgContainerRef = useRef<HTMLDivElement | undefined>(undefined);
  const setSvgValue = useSetSVG();
  const [sViewBox, setViewBox] = useState<IViewBox | undefined>(undefined);

  useEffect(() => {
    setSvgValue(svgImageRef.current);
    return () => setSvgValue(undefined);
  }, [svgImageRef.current]);

  useEffect(() => {
    // console.log('SVGContainer isInteracting', isInteracting);
    const svgImage = svgImageRef.current;
    const svgContainer = svgContainerRef.current;
    let lViewBox: IViewBox | undefined = undefined;
    let onwheel: ((ev: WheelEvent) => any) | null = null;
    let onmousedown: ((ev: MouseEvent) => any) | null = null;
    let onmouseup: ((ev: MouseEvent) => any) | null = null;
    let onmousemove: ((ev: MouseEvent) => any) | null = null;
    let onmouseleave: ((ev: MouseEvent) => any) | null = null;
    function clean2ndListeners() {
      if (svgContainer) {
        svgContainer.removeEventListener("mousemove", onmousemove!);
        svgContainer.removeEventListener("mouseup", onmouseup!);
        svgContainer.removeEventListener("mouseleave", onmouseleave!);
      }
    }
    function cleanup(viewBox: IViewBox | undefined) {
      if (viewBox) {
        setViewBox(viewBox);
      }
      if (svgContainer) {
        // console.log("cleanup");
        svgContainer.removeEventListener("wheel", onwheel!);
        svgContainer.removeEventListener("mousedown", onmousedown!);
        clean2ndListeners();
      }
    }
    /**static */
    function newMovedViewBox(
      e: MouseEvent,
      viewBox: IViewBox,
      startPoint: { x: number; y: number },
      scale: number
    ): IViewBox {
      const dx = (startPoint.x - e.x) / scale;
      const dy = (startPoint.y - e.y) / scale;
      return {
        x: viewBox.x + dx,
        y: viewBox.y + dy,
        w: viewBox.w,
        h: viewBox.h,
      };
    }
    const viewBoxStr = (viewbox: IViewBox) =>
      `${viewbox.x} ${viewbox.y} ${viewbox.w} ${viewbox.h}`;

    // console.log('SVGContainer isInteracting', isInteracting);
    if (svgImage && svgContainer && !isInteracting) {
      // console.log('SVGContainer adding listeners')
      // https://stackoverflow.com/questions/52576376/how-to-zoom-in-on-a-complex-svg-structure
      const svgSize = { w: svgImage.clientWidth, h: svgImage.clientHeight };
      lViewBox =
        sViewBox ||
        ({
          x: 0,
          y: 0,
          w: svgImage.clientWidth,
          h: svgImage.clientHeight,
        } as IViewBox);
      let viewBox = lViewBox!;
      // setViewBox(viewBox);
      let startPoint = { x: 0, y: 0 };
      let scale = svgSize.w / viewBox.w;

      // console.log("SVGContainer viewBox", viewBox);

      onwheel = function (e) {
        e.preventDefault();
        var w = viewBox.w;
        var h = viewBox.h;
        // console.log('viewBox.w',viewBox.w);
        var mx = e.offsetX; //mouse x
        var my = e.offsetY;
        var dw = w * Math.sign(e.deltaY) * 0.05;
        var dh = h * Math.sign(e.deltaY) * 0.05;
        var dx = (dw * mx) / svgSize.w;
        var dy = (dh * my) / svgSize.h;
        viewBox = {
          x: viewBox.x + dx,
          y: viewBox.y + dy,
          w: viewBox.w - dw,
          h: viewBox.h - dh,
        };
        scale = svgSize.w / viewBox.w;
        svgImage.setAttribute("viewBox", viewBoxStr(viewBox));
        lViewBox = viewBox;
      };
      svgContainer.addEventListener("wheel", onwheel);

      onmousemove = (e) => {
        const newViewBox = newMovedViewBox(e, viewBox, startPoint, scale);
        svgImage.setAttribute("viewBox", viewBoxStr(newViewBox));
      };

      onmouseup = (e) => {
        const newViewBox = newMovedViewBox(e, viewBox, startPoint, scale);
        viewBox = newViewBox;
        svgImage.setAttribute("viewBox", viewBoxStr(newViewBox));

        lViewBox = viewBox;
        clean2ndListeners();
      };

      onmouseleave = (e) => {
        const newViewBox = newMovedViewBox(e, viewBox, startPoint, scale);
        viewBox = newViewBox;
        svgImage.setAttribute("viewBox", viewBoxStr(newViewBox));

        lViewBox = viewBox;
        clean2ndListeners();
      };

      onmousedown = (e) => {
        // middle button
        // const isMiddleBtn = e.button === 1 || 1 === (e.button & 2);
        if (true) {
          startPoint = { x: e.x, y: e.y };

          svgContainer.addEventListener("mousemove", onmousemove!);
          svgContainer.addEventListener("mouseup", onmouseup!);
          svgContainer.addEventListener("mouseleave", onmouseleave!);
        }
      };
      svgContainer.addEventListener("mousedown", onmousedown);
    }
    return () => cleanup(lViewBox);
  }, [
    svgImageRef.current,
    svgContainerRef.current,
    width,
    height,
    isInteracting,
  ]);
  const setSelectedItems = useSetSelectedItem();
  const onBgClick = useCallback(() => setSelectedItems(undefined), emptyArr);
  const style = useMemo(
    () => ({
      border: "1px solid green",
      width: width,
      backgroundColor: "#fffff8",
    }),
    [width]
  );
  return (
    // @ts-ignore
    <div ref={svgContainerRef}>
      <svg
        // @ts-ignore
        ref={svgImageRef}
        height={height}
        style={style}
        onClick={onBgClick}
        xmlns="http://www.w3.org/2000/svg"
      >
        {children}
      </svg>
    </div>
  );
}

interface ISingleNodeProps {
  it: INodeProps;
  currentDrawingPortAddress: IPortAddressExtra | undefined;
  setElements: React.Dispatch<React.SetStateAction<Record<string, INodeProps>>>;
  setDraggingFromTo: React.Dispatch<
    React.SetStateAction<DraggingPortPosFromTo>
  >;
  setIsInteracting: React.Dispatch<React.SetStateAction<boolean>>;
}

function SingleNode(props: ISingleNodeProps) {
  const {
    it,
    setElements,
    currentDrawingPortAddress,
    setDraggingFromTo,
    setIsInteracting,
  } = props;
  const onPositionChange = useCallback(
    (position: [number, number]) =>
      setElements((els) => ({ ...els, [it.id]: { ...els[it.id], position } })),
    [it.id, setElements]
  );

  const onSizeChange = useCallback(
    (size: [number, number]) =>
      setElements((els) => ({ ...els, [it.id]: { ...els[it.id], size } })),
    [it.id, setElements]
  );
  return (
    <Node
      id={it.id}
      key={it.id}
      position={it.position}
      size={it.size}
      resizable={it.resizable}
      text={it.text}
      onPositionChange={onPositionChange}
      onSizeChange={onSizeChange}
      ports={it.ports}
      setDraggingFromTo={setDraggingFromTo}
      currentDrawingPortAddress={currentDrawingPortAddress}
      setIsInteracting={setIsInteracting}
    />
  );
}

interface INodeListProps {
  currentDrawingPortAddress: IPortAddressExtra | undefined;
  elements: Record<string, INodeProps>;
  setElements: React.Dispatch<React.SetStateAction<Record<string, INodeProps>>>;
  setDraggingFromTo: React.Dispatch<
    React.SetStateAction<DraggingPortPosFromTo>
  >;
  setIsInteracting: React.Dispatch<React.SetStateAction<boolean>>;
}

function NodeList(props: INodeListProps) {
  const {
    currentDrawingPortAddress,
    elements,
    setElements,
    setDraggingFromTo,
    setIsInteracting,
  } = props;
  const nodes = useMemo(
    () =>
      Object.values(elements).map((it) => (
        <SingleNode
          it={it}
          key={it.id}
          setElements={setElements}
          setDraggingFromTo={setDraggingFromTo}
          currentDrawingPortAddress={currentDrawingPortAddress}
          setIsInteracting={setIsInteracting}
        />
      )),
    [setDraggingFromTo, setElements, elements, currentDrawingPortAddress]
  );
  return <>{nodes}</>;
}

function GTFlowEngine() {
  const [currentDrawingPortAddress, setCurrentDrawingPortAddress] = useState<
    IPortAddressExtra | undefined
  >(undefined);
  const [elements, setElements] = useState<Record<string, INodeProps>>(() =>
    arrayToRecords(defaultElements, "id")
  );
  const [connectors, setConnectors] = useState(defaultConnectors);

  const [draggingFromTo, setDraggingFromTo] =
    useState<DraggingPortPosFromTo>(undefined);
  const [prevDraggingFromTo, setPrevDraggingFromTo] =
    useState<DraggingPortPosFromTo>(draggingFromTo);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const origin = getDraggingOrigin(draggingFromTo);
    if (origin) {
      const [node, portId] = origin;
      const port = elements[node].ports.find((it) => it.id === portId)!;
      setCurrentDrawingPortAddress({ node, port });
    } else {
      setCurrentDrawingPortAddress(undefined);
    }
    // console.log('origin, draggingFromTo; prevDraggingFromTo', JSON.stringify(origin), JSON.stringify(draggingFromTo), JSON.stringify(prevDraggingFromTo));
    if (
      draggingFromTo === undefined &&
      prevDraggingFromTo?.from &&
      prevDraggingFromTo.to
    ) {
      const { from: draggingFrom, to: draggingTo } = prevDraggingFromTo;
      const newId = Date.now().toString(36);
      const [fromNode, fromPort] = draggingFrom!;
      const [toNode, toPort] = draggingTo!;
      const connector = {
        id: newId,
        from: {
          node: fromNode,
          port: fromPort,
        },
        to: {
          node: toNode,
          port: toPort,
        },
      } as INodeConnector;
      setConnectors((connectors) => [...connectors, connector]);
    }
    setPrevDraggingFromTo(draggingFromTo);
  }, [draggingFromTo, elements]);

  return (
    <SVGContainer
      width="100%"
      height={600}
      isInteracting={isInteracting || !!currentDrawingPortAddress}
    >
      {/* <rect x={0} y={0} width={window.innerWidth} height="100%" fill="#fee" onClick={() => console.log('bg clicked')} /> */}
      <ConnectorsDrawer connectors={connectors} elements={elements} />
      <NodeList
        elements={elements}
        currentDrawingPortAddress={currentDrawingPortAddress}
        setDraggingFromTo={setDraggingFromTo}
        setElements={setElements}
        setIsInteracting={setIsInteracting}
      />
    </SVGContainer>
  );
}

export default GTFlowEngine;
