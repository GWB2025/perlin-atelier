#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *const AppTitle = @"Perlin Atelier";

static BOOL ValidName(id name) {
    if (![name isKindOfClass:NSString.class] || [name length] == 0 || [name length] > 180) return NO;
    if (![name isEqualToString:[name lastPathComponent]] || [name containsString:@"\\"] || [name containsString:@":"]) return NO;
    if ([name rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location != NSNotFound) return NO;
    return [@[@"svg", @"png"] containsObject:[[name pathExtension] lowercaseString]];
}

static NSData *ExportData(id body) {
    if (![body isKindOfClass:NSDictionary.class] || !ValidName(body[@"name"])) return nil;
    id encoded = body[@"data"];
    if (![encoded isKindOfClass:NSString.class] || [encoded length] > 40 * 1024 * 1024) return nil;
    NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded options:0];
    return data.length > 0 ? data : nil;
}

static int SelfTest(void) {
    NSURL *page = [NSBundle.mainBundle URLForResource:@"Perlin_Atelier" withExtension:@"html"];
    NSString *html = [NSString stringWithContentsOfURL:page encoding:NSUTF8StringEncoding error:nil];
    if (!html || ![html containsString:@"AtelierDownload"] || ![html containsString:@"Letter garden"] ||
        ![html containsString:@"1.1.1"] || [html containsString:@"<script src="]) return 1;
    for (id value in @[@"../other.svg", @"/tmp/file.png", @"x.exe", @"a:b.svg", @"a\\b.svg", @"a\n.svg", @42])
        if (ValidName(value)) return 2;
    if (!ValidName(@"my-postcard.svg") || !ValidName(@"my-preview.png")) return 3;
    NSData *expected = [@"<svg>£ café</svg>" dataUsingEncoding:NSUTF8StringEncoding];
    if (![ExportData(@{@"name":@"test.svg",@"data":[expected base64EncodedStringWithOptions:0]}) isEqualToData:expected]) return 4;
    if (ExportData(@{@"name":@"test.svg",@"data":@"!invalid!"}) || ExportData(@{})) return 5;
    puts("Perlin Atelier 1.1.1: bundled page, native filename validation and export decoding passed.");
    return 0;
}

static int MakeIcon(NSString *path) {
    CGColorSpaceRef colour = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(NULL, 1024, 1024, 8, 0, colour, kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(colour);
    if (!context) return 1;
    CGContextSetRGBFillColor(context, .105, .345, .298, 1);
    CGPathRef box = CGPathCreateWithRoundedRect(CGRectMake(24,24,976,976),210,210,NULL);
    CGContextAddPath(context,box); CGContextFillPath(context); CGPathRelease(box);
    const double colours[3][3]={{.96,.94,.85},{.83,.48,.23},{.68,.54,.38}};
    for (int k=0;k<3;k++) {
        CGContextSetRGBStrokeColor(context,colours[k][0],colours[k][1],colours[k][2],1);
        CGContextSetLineWidth(context,28); CGContextSetLineCap(context,kCGLineCapRound);
        CGContextMoveToPoint(context,170,280+k*105);
        CGContextAddCurveToPoint(context,410,150+k*70,510,830-k*65,855,610+k*90);
        CGContextStrokePath(context);
    }
    CGImageRef img=CGBitmapContextCreateImage(context);
    CGImageDestinationRef dest=CGImageDestinationCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path],CFSTR("public.png"),1,NULL);
    if (!dest) {CGImageRelease(img);CGContextRelease(context);return 1;}
    CGImageDestinationAddImage(dest,img,NULL); BOOL ok=CGImageDestinationFinalize(dest);
    CFRelease(dest);CGImageRelease(img);CGContextRelease(context);return ok?0:1;
}

@interface AtelierDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandlerWithReply>
@property NSWindow *window;
@property WKWebView *web;
@property NSURL *page;
@property BOOL saving;
@end

@implementation AtelierDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    NSMenu *menu=[NSMenu new];
    NSMenuItem *appItem=[NSMenuItem new];[menu addItem:appItem];
    NSMenu *appMenu=[NSMenu new];appItem.submenu=appMenu;
    [appMenu addItemWithTitle:@"About Perlin Atelier" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Quit Perlin Atelier" action:@selector(terminate:) keyEquivalent:@"q"];
    NSMenuItem *editItem=[NSMenuItem new];[menu addItem:editItem];
    NSMenu *edit=[[NSMenu alloc] initWithTitle:@"Edit"];editItem.submenu=edit;
    [edit addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    [edit addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [edit addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [edit addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [edit addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    NSApp.mainMenu=menu;
    self.page=[NSBundle.mainBundle URLForResource:@"Perlin_Atelier" withExtension:@"html"];
    WKWebViewConfiguration *config=[WKWebViewConfiguration new];
    config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    [config.userContentController addScriptMessageHandlerWithReply:self contentWorld:WKContentWorld.pageWorld name:@"saveFile"];
    self.web=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1280,880) configuration:config];
    self.web.navigationDelegate=self;
    self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1280,880)
        styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title=@"Perlin Atelier 1.1.1";self.window.contentView=self.web;
    self.window.minSize=NSMakeSize(920,650);self.window.releasedWhenClosed=NO;
    [self.window center];[self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self.web loadFileURL:self.page allowingReadAccessToURL:self.page.URLByDeletingLastPathComponent];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)visible {
    [self.window makeKeyAndOrderFront:nil];return YES;
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decision {
    NSURL *url=action.request.URL;
    if ([url isEqual:self.page]) {decision(WKNavigationActionPolicyAllow);return;}
    if (action.navigationType==WKNavigationTypeLinkActivated && [@[@"https",@"http"] containsObject:url.scheme.lowercaseString])
        [NSWorkspace.sharedWorkspace openURL:url];
    decision(WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSAlert *alert=[NSAlert new];alert.messageText=@"Unable to open Perlin Atelier";
    alert.informativeText=error.localizedDescription;[alert beginSheetModalForWindow:self.window completionHandler:nil];
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message replyHandler:(void (^)(id,NSString *))reply {
    if (!message.frameInfo.mainFrame || ![message.frameInfo.request.URL isEqual:self.page]) {reply(nil,@"Untrusted export request.");return;}
    NSData *data=ExportData(message.body);
    if (!data) {reply(nil,@"Invalid export data.");return;}
    if (self.saving) {reply(nil,@"Finish the current Save dialogue first.");return;}
    self.saving=YES;
    NSString *name=message.body[@"name"];
    NSSavePanel *panel=NSSavePanel.savePanel;panel.nameFieldStringValue=name;
    panel.title=@"Save Perlin Atelier artwork";panel.canCreateDirectories=YES;
    UTType *type=[UTType typeWithFilenameExtension:name.pathExtension];
    if(type) panel.allowedContentTypes=@[type];
    panel.allowsOtherFileTypes=NO;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
        self.saving=NO;
        if(response!=NSModalResponseOK) {reply(@NO,nil);return;}
        NSError *error=nil;
        BOOL saved=[data writeToURL:panel.URL options:NSDataWritingAtomic error:&error];
        reply(saved?@YES:nil,saved?nil:error.localizedDescription);
    }];
}
@end

int main(int argc,const char *argv[]) {
    @autoreleasepool {
        if(argc==2 && strcmp(argv[1],"--self-test")==0) return SelfTest();
        if(argc==3 && strcmp(argv[1],"--make-icon")==0) return MakeIcon([NSString stringWithUTF8String:argv[2]]);
        [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        AtelierDelegate *delegate=[AtelierDelegate new];NSApp.delegate=delegate;[NSApp run];
    }
    return 0;
}
