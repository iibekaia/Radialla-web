// Run on macOS from the repository root:
// swift -module-cache-path /tmp/radialla-swift-cache scripts/generate-icons.swift
import AppKit

let directory = URL(fileURLWithPath: "web/public", isDirectory: true)
let data = try Data(contentsOf: directory.appendingPathComponent("radio-logo.png"))
let source = NSBitmapImageRep(data: data)!
let image = source.cgImage!

// Find the light logo mark, excluding transparent pixels and the dark background.
var minX = image.width, minY = image.height, maxX = 0, maxY = 0
for y in 0..<image.height {
    for x in 0..<image.width {
        let color = source.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        if color.alphaComponent > 0.5 && min(color.redComponent, color.greenComponent, color.blueComponent) > 0.5 {
            minX = min(minX, x); minY = min(minY, y)
            maxX = max(maxX, x); maxY = max(maxY, y)
        }
    }
}
precondition(maxX > minX && maxY > minY, "Source logo mark was not found")
let mark = image.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1))!

func png(size: Int, coverage: Double) -> Data {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                            bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(gray: 0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    let scale = Double(size) * coverage / Double(max(mark.width, mark.height))
    let width = Double(mark.width) * scale, height = Double(mark.height) * scale
    context.interpolationQuality = .high
    context.draw(mark, in: CGRect(x: (Double(size) - width) / 2, y: (Double(size) - height) / 2,
                                 width: width, height: height))
    return NSBitmapImageRep(cgImage: context.makeImage()!).representation(using: .png, properties: [:])!
}

for (name, size, coverage) in [
    ("favicon-16x16.png", 16, 0.8),
    ("favicon-32x32.png", 32, 0.8),
    ("favicon-48x48.png", 48, 0.8),
    ("apple-touch-icon.png", 180, 0.7),
    ("android-chrome-192x192.png", 192, 0.7),
    ("android-chrome-512x512.png", 512, 0.7),
    // A 55% square fits entirely inside the maskable icon's 40% safe radius.
    ("maskable-icon-512x512.png", 512, 0.55),
] {
    try png(size: size, coverage: coverage).write(to: directory.appendingPathComponent(name))
}

// ICO directory with PNG frames for modern browsers and Windows shortcuts.
func littleEndian(_ value: Int, bytes: Int) -> Data {
    Data((0..<bytes).map { UInt8((value >> ($0 * 8)) & 255) })
}
let sizes = [16, 32, 48]
let frames = sizes.map { png(size: $0, coverage: 0.8) }
var ico = Data([0, 0, 1, 0, 3, 0])
var offset = 6 + 16 * frames.count
for (size, frame) in zip(sizes, frames) {
    ico.append(contentsOf: [UInt8(size), UInt8(size), 0, 0])
    ico.append(littleEndian(1, bytes: 2))
    ico.append(littleEndian(32, bytes: 2))
    ico.append(littleEndian(frame.count, bytes: 4))
    ico.append(littleEndian(offset, bytes: 4))
    offset += frame.count
}
for frame in frames { ico.append(frame) }
try ico.write(to: directory.appendingPathComponent("favicon.ico"))
print("Generated favicon, Apple Touch and Android icons from radio-logo.png")
