using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

// Draws only this prototype window. No HTML, bitmap assets or external window hooks.
sealed class NativeLoadingWindow : Form {
    readonly Timer clock = new Timer();
    readonly bool dark;
    readonly DateTime started = DateTime.UtcNow;
    readonly string screenshot;
    bool captured;
    public NativeLoadingWindow(bool dark, string screenshot) {
        this.dark = dark;
        this.screenshot = screenshot;
        Text = "Native loading proof";
        AutoScaleMode = AutoScaleMode.None;
        ClientSize = new Size(900, 640);
        StartPosition = FormStartPosition.CenterScreen;
        DoubleBuffered = true;
        BackColor = dark ? Color.FromArgb(27,31,39) : Color.FromArgb(243,245,248);
        clock.Interval = 16;
        clock.Tick += delegate {
            Invalidate();
            if (!captured && screenshot != null && (DateTime.UtcNow-started).TotalSeconds > 1) {
                captured = true;
                using (Bitmap image = new Bitmap(ClientSize.Width,ClientSize.Height)) {
                    DrawToBitmap(image,new Rectangle(Point.Empty,ClientSize));
                    image.Save(screenshot);
                }
                ClientSize = new Size(720,520);
            }
            if (screenshot != null && (DateTime.UtcNow-started).TotalSeconds > 3) Close();
        };
        Shown += delegate { clock.Start(); };
        FormClosed += delegate { clock.Stop(); clock.Dispose(); };
    }
    static GraphicsPath Rounded(RectangleF r, float radius) {
        GraphicsPath path = new GraphicsPath();
        float d=radius*2;
        path.AddArc(r.Left,r.Top,d,d,180,90);
        path.AddArc(r.Right-d,r.Top,d,d,270,90);
        path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
        path.AddArc(r.Left,r.Bottom-d,d,d,90,90);
        path.CloseFigure();
        return path;
    }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        Graphics g=e.Graphics;
        float scale=g.DpiX/96f;
        g.ScaleTransform(scale,scale);
        g.SmoothingMode=SmoothingMode.AntiAlias;
        float width=ClientSize.Width/scale,height=ClientSize.Height/scale;
        RectangleF card=new RectangleF((width-178)/2,(height-124)/2,178,124);
        for(int i=12;i>0;i--) {
            RectangleF shadow=new RectangleF(card.X-i,card.Y-i+5,card.Width+i*2,card.Height+i*2);
            using(GraphicsPath p=Rounded(shadow,12+i))
            using(SolidBrush b=new SolidBrush(Color.FromArgb(2,0,0,0))) g.FillPath(b,p);
        }
        Color line=dark?Color.FromArgb(58,68,82):Color.FromArgb(201,209,219);
        using(GraphicsPath p=Rounded(card,12))
        using(SolidBrush b=new SolidBrush(dark?Color.FromArgb(37,42,50):Color.White))
        using(Pen border=new Pen(line,1)) { g.FillPath(b,p);g.DrawPath(border,p); }
        RectangleF ring=new RectangleF(width/2-16,card.Top+25,32,32);
        using(Pen track=new Pen(line,3)) g.DrawEllipse(track,ring);
        using(Pen arc=new Pen(dark?Color.FromArgb(96,165,250):Color.FromArgb(15,108,189),3)) {
            float angle=(float)((DateTime.UtcNow-started).TotalMilliseconds%800/800*360)-90;
            g.DrawArc(arc,ring,angle,90);
        }
        using(Font font=new Font("Segoe UI",14,FontStyle.Regular,GraphicsUnit.Pixel))
        using(SolidBrush text=new SolidBrush(dark?Color.FromArgb(232,236,242):Color.FromArgb(32,38,46)))
        using(StringFormat format=new StringFormat()) {
            format.Alignment=StringAlignment.Center;
            format.LineAlignment=StringAlignment.Center;
            g.DrawString("正在加载资源…",font,text,new RectangleF(card.X,card.Top+71,card.Width,24),format);
        }
    }
    [STAThread]
    static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NativeLoadingWindow(args.Length>0 && args[0]=="dark",args.Length>1?args[1]:null));
    }
}
