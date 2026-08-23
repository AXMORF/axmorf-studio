import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2,
      let pid = Int32(CommandLine.arguments[1]) else {
  exit(2)
}

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let count = windows.filter { window in
  guard let ownerPid = (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
        let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue else {
    return false
  }
  return ownerPid == pid && layer == 0
}.count
print(count)
