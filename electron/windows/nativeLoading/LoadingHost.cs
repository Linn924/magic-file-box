using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

sealed class WindowOwner : IWin32Window {
    public IntPtr Handle { get; private set; }
    public WindowOwner(long handle) { Handle = new IntPtr(handle); }
}

sealed class LoadingCard : Form {
    readonly System.Windows.Forms.Timer clock = new System.Windows.Forms.Timer();
    readonly DateTime started = DateTime.UtcNow;
    readonly int id;
    bool dark, animate, reported, closedReported;
    float scale;
    int revision;
    public LoadingCard(int id) {
        this.id = id;
        Text = "魔法文件匣加载提示";
        AccessibleName = "正在加载资源";
        AccessibleRole = AccessibleRole.StatusBar;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        DoubleBuffered = true;
        clock.Interval = 16;
        clock.Tick += delegate { Invalidate(); };
        FormClosed += delegate {
            clock.Stop();
            clock.Dispose();
            ReportClosed();
        };
    }
    void ReportClosed() {
        if (closedReported) return;
        closedReported=true;
        Console.WriteLine("CLOSED\t"+id);
    }
    public void CloseCard() {
        if (!IsDisposed) {
            clock.Stop();
            Close();
            Dispose();
        }
        clock.Dispose();
        ReportClosed();
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
        get {
            CreateParams value = base.CreateParams;
            value.ExStyle |= 0x08000000 | 0x00000080;
            return value;
        }
    }
    public void Configure(string[] fields) {
        int left = int.Parse(fields[3], CultureInfo.InvariantCulture);
        int top = int.Parse(fields[4], CultureInfo.InvariantCulture);
        int width = int.Parse(fields[5], CultureInfo.InvariantCulture);
        int height = int.Parse(fields[6], CultureInfo.InvariantCulture);
        scale = float.Parse(fields[7], CultureInfo.InvariantCulture);
        dark = fields[8] == "dark";
        animate = fields[9] == "1";
        revision = int.Parse(fields[11],CultureInfo.InvariantCulture);
        if (scale < 0.5f || scale > 8 || width <= 0 || height <= 0)
            throw new ArgumentException("Invalid loading bounds");
        int cardWidth = (int)Math.Round(220 * scale);
        int cardHeight = (int)Math.Round(176 * scale);
        Bounds = new Rectangle(left + (width-cardWidth)/2, top + (height-cardHeight)/2,
            cardWidth, cardHeight);
        BackColor = dark ? Color.FromArgb(27,31,39) : Color.FromArgb(243,245,248);
        reported = false;
        if (animate) clock.Start(); else clock.Stop();
        Invalidate();
    }
    public void CaptureScreen(string filename) {
        // Verification captures only this owned card's screen rectangle.
        using (Bitmap image = new Bitmap(Width, Height))
        using (Graphics graphics = Graphics.FromImage(image)) {
            graphics.CopyFromScreen(Location, Point.Empty, Size);
            image.Save(filename);
        }
        Console.WriteLine("CAPTURED\t" + id);
    }
    public void Present(long owner, bool visible) {
        if (visible) {
            if (!Visible) Show(new WindowOwner(owner));
            if (animate) clock.Start(); else clock.Stop();
        } else {
            Hide();
            clock.Stop();
        }
    }
    static GraphicsPath Rounded(RectangleF r, float radius) {
        GraphicsPath path = new GraphicsPath();
        float diameter = radius * 2;
        path.AddArc(r.Left,r.Top,diameter,diameter,180,90);
        path.AddArc(r.Right-diameter,r.Top,diameter,diameter,270,90);
        path.AddArc(r.Right-diameter,r.Bottom-diameter,diameter,diameter,0,90);
        path.AddArc(r.Left,r.Bottom-diameter,diameter,diameter,90,90);
        path.CloseFigure();
        return path;
    }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.ScaleTransform(scale, scale);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        RectangleF card = new RectangleF(21,26,178,124);
        for (int i=12;i>0;i--) {
            RectangleF shadow = new RectangleF(card.X-i,card.Y-i+5,card.Width+i*2,card.Height+i*2);
            using (GraphicsPath p=Rounded(shadow,12+i))
            using (SolidBrush b=new SolidBrush(Color.FromArgb(2,0,0,0))) g.FillPath(b,p);
        }
        Color line = dark ? Color.FromArgb(58,68,82) : Color.FromArgb(201,209,219);
        using (GraphicsPath p=Rounded(card,12))
        using (SolidBrush b=new SolidBrush(dark ? Color.FromArgb(37,42,50) : Color.White))
        using (Pen border=new Pen(line,1)) { g.FillPath(b,p); g.DrawPath(border,p); }
        RectangleF ring = new RectangleF(94,51,32,32);
        using (Pen track=new Pen(line,3)) g.DrawEllipse(track,ring);
        using (Pen arc=new Pen(dark ? Color.FromArgb(96,165,250) : Color.FromArgb(15,108,189),3)) {
            float angle = animate ? (float)((DateTime.UtcNow-started).TotalMilliseconds%800/800*360)-90 : -90;
            g.DrawArc(arc,ring,angle,90);
        }
        using (Font font=new Font("Segoe UI",14,FontStyle.Regular,GraphicsUnit.Pixel))
        using (SolidBrush text=new SolidBrush(dark ? Color.FromArgb(232,236,242) : Color.FromArgb(32,38,46)))
        using (StringFormat format=new StringFormat()) {
            format.Alignment=StringAlignment.Center;
            format.LineAlignment=StringAlignment.Center;
            g.DrawString("正在加载资源…",font,text,new RectangleF(21,97,178,24),format);
        }
        if (!reported) {
            reported=true;
            Console.WriteLine("PAINTED\t" + id + "\t" + Left + "\t" + Top + "\t" + Width + "\t" + Height + "\t" + revision);
        }
    }
}

static class LoadingHost {
    static readonly Dictionary<int,LoadingCard> cards = new Dictionary<int,LoadingCard>();
    static Control dispatcher;
    static ApplicationContext context;
    static void CloseAll() {
        foreach (LoadingCard card in new List<LoadingCard>(cards.Values)) card.CloseCard();
        cards.Clear();
        context.ExitThread();
    }
    static void Command(string line) {
        string[] fields=line.Split('\t');
        try {
            if (fields[0]=="QUIT") { CloseAll(); return; }
            int id=int.Parse(fields[1],CultureInfo.InvariantCulture);
            LoadingCard card;
            if (fields[0]=="CLOSE") {
                if (cards.TryGetValue(id,out card)) { cards.Remove(id); card.CloseCard(); }
                else Console.WriteLine("CLOSED\t"+id);
                return;
            }
            if (fields[0]=="CAPTURE") {
                if (cards.TryGetValue(id,out card))
                    card.CaptureScreen(Encoding.UTF8.GetString(Convert.FromBase64String(fields[2])));
                else Console.WriteLine("ERROR\t"+id);
                return;
            }
            if (fields[0]!="UPDATE" || fields.Length!=12) return;
            if (!cards.TryGetValue(id,out card)) {
                card=new LoadingCard(id);
                cards.Add(id,card);
                card.Configure(fields);
            } else card.Configure(fields);
            card.Present(long.Parse(fields[2],CultureInfo.InvariantCulture),fields[10]=="1");
            Console.WriteLine("UPDATED\t"+id);
        } catch (Win32Exception error) {
            int id;
            LoadingCard cancelled;
            if ((error.NativeErrorCode==6 || error.NativeErrorCode==1400) &&
                fields.Length>1 && int.TryParse(fields[1],out id) && cards.TryGetValue(id,out cancelled)) {
                cards.Remove(id);
                cancelled.CloseCard();
            } else {
                Console.Error.WriteLine(error);
                Console.WriteLine("ERROR\t"+(fields.Length>1?fields[1]:"0"));
            }
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            Console.WriteLine("ERROR\t"+(fields.Length>1?fields[1]:"0"));
        }
    }
    [STAThread]
    static void Main() {
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)) { AutoFlush=true });
        Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)) { AutoFlush=true });
        StreamReader input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false));
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        context=new ApplicationContext();
        dispatcher=new Control();
        IntPtr handle=dispatcher.Handle;
        Thread reader=new Thread(delegate() {
            try {
                string line;
                while ((line=input.ReadLine())!=null) {
                    string command=line;
                    dispatcher.BeginInvoke((Action)delegate { Command(command); });
                }
            } catch {}
            try { dispatcher.BeginInvoke((Action)CloseAll); } catch {}
        });
        reader.IsBackground=true;
        reader.Start();
        Application.Run(context);
        dispatcher.Dispose();
    }
}
