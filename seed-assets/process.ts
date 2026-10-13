// One-off: render the hand-crafted SVG logos to PNG data URLs for the DB
// + regenerate the PWA icon set from the new SaloonX mark.
import sharp from "sharp"
import { readFileSync, writeFileSync } from "fs"

const A = "/home/z/my-project/seed-assets"
const P = "/home/z/my-project/public/icons"

async function toDataUrl(svg: string, out: string, size = 512) {
  const buf = await sharp(svg).resize(size, size).png().toBuffer()
  const b64 = `data:image/png;base64,${buf.toString("base64")}`
  writeFileSync(out, b64)
  console.log(`${out}: ${Math.round(b64.length / 1024)}KB data URL`)
}

async function icon(svg: string, out: string, size: number, pad = 0) {
  let p = sharp(svg).resize(size, size, { fit: "contain" })
  if (pad > 0) {
    const inner = Math.round(size * (1 - pad * 2))
    p = sharp(svg)
      .resize(inner, inner, { fit: "contain" })
      .extend({
        top: Math.round(size * pad), bottom: Math.round(size * pad),
        left: Math.round(size * pad), right: Math.round(size * pad),
        background: { r: 94, g: 26, b: 44, alpha: 1 },
      })
  }
  await p.png().toFile(out)
  console.log(`wrote ${out}`)
}

async function main() {
  const logos: [string, string][] = [
    ["saloonx-logo.svg", "saloonx.b64.txt"],
    ["glowgo-logo.svg", "glowgo.b64.txt"],
    ["urbancuts-logo.svg", "urbancuts.b64.txt"],
    ["bronzeblunt-logo.svg", "bronzeblunt.b64.txt"],
  ]
  for (const [svg, out] of logos) {
    await toDataUrl(`${A}/${svg}`, `${A}/${out}`)
  }

  const src = `${A}/saloonx-logo.svg`
  await icon(src, `${P}/icon-1024.png`, 1024)
  await icon(src, `${P}/icon-512.png`, 512)
  await icon(src, `${P}/icon-192.png`, 192)
  await icon(src, `${P}/apple-touch-icon.png`, 180)
  await icon(src, `${P}/icon-maskable-512.png`, 512, 0.12)
  console.log("done")
}

main()
