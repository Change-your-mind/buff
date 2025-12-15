// @ts-check

// the "export" tells JavaScript what the outside world can see
/**
 * Draw the triangle and square in the first Canvas
 * 
 * @param {CanvasRenderingContext2D} context 
 */
export function drawTriSquare(context) {
    context.fillStyle = "goldenrod";
    context.fillRect(20, 20, 20, 20);
    context.fillStyle = "red";
    context.beginPath();
    context.moveTo(25, 25);
    context.lineTo(25, 35);
    context.lineTo(35, 30);
    context.fill();
}

