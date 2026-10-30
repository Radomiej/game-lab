export const gameUiRuntimeFiles = {
 'UIAnchor.java': `package engine;
public final class UIAnchor {private UIAnchor(){} public static final String TOP_LEFT="TOP_LEFT",TOP_CENTER="TOP_CENTER",TOP_RIGHT="TOP_RIGHT",CENTER_LEFT="CENTER_LEFT",CENTER="CENTER",CENTER_RIGHT="CENTER_RIGHT",BOTTOM_LEFT="BOTTOM_LEFT",BOTTOM_CENTER="BOTTOM_CENTER",BOTTOM_RIGHT="BOTTOM_RIGHT";}
`,
 'UIBounds.java': `package engine;
public final class UIBounds {public final double left,top,right,bottom;public UIBounds(double left,double top,double right,double bottom){this.left=left;this.top=top;this.right=right;this.bottom=bottom;}public double centerX(){return (left+right)/2;}public double centerY(){return (top+bottom)/2;}}
`,
 'UITransform.java': `package engine;
public class UITransform extends Component {
 public double width,height;public String anchor=UIAnchor.CENTER;public Vector2 pivot;
 public UITransform(){this(100,30);}public UITransform(double width,double height){this.width=width;this.height=height;updateMode="UI";}
 public UIBounds getBounds(){double x=anchor.endsWith("LEFT")?0:anchor.endsWith("RIGHT")?1:.5,y=anchor.startsWith("TOP")?0:anchor.startsWith("BOTTOM")?1:.5;double left=getGame().getViewportWidth()*x+gameObject.transform.x-width*(pivot==null?x:pivot.x),top=getGame().getViewportHeight()*y+gameObject.transform.y-height*(pivot==null?y:pivot.y);return new UIBounds(left,top,left+width,top+height);}
 public Vector2 getCenter(){UIBounds b=getBounds();return new Vector2(b.centerX(),b.centerY());}
 public static UIBounds bounds(Component c,double width,double height){UITransform t=c.getComponent(UITransform.class);return t!=null&&t.enabled?t.getBounds():new UIBounds(c.gameObject.transform.x-width/2,c.gameObject.transform.y-height/2,c.gameObject.transform.x+width/2,c.gameObject.transform.y+height/2);}
}
`,
 'ShapeRenderer.java': `package engine;
public class ShapeRenderer extends Component {public double width,height;public String color,space="world",shape="rect";public double radius=16;public int layer,order;public static ShapeRenderer circle(double radius,String color){if(!Double.isFinite(radius)||radius<0)throw new IllegalArgumentException("Niepoprawny promien");ShapeRenderer r=new ShapeRenderer(radius*2,radius*2,color);r.shape="circle";r.radius=radius;return r;}public ShapeRenderer(){this(32,32,"#76b9f2");}public ShapeRenderer(double width,double height,String color){this.width=width;this.height=height;this.color=color;}}
`,
 'TextRenderer.java': `package engine;
public class TextRenderer extends Component {
 public String text,color,align="center",baseline="middle",space="world";public double fontSize;public int layer,order;
 public TextRenderer(String text){this(text,16,"#ffffff");}public TextRenderer(String text,double fontSize,String color){this.text=text;this.fontSize=fontSize;this.color=color;}
 @Override public void onDrawUI(){UITransform ui=getComponent(UITransform.class);Vector2 center=ui!=null&&ui.enabled?ui.getCenter():new Vector2(gameObject.transform.x,gameObject.transform.y);Vector2 view=ui!=null&&ui.enabled||space.equals("screen")?new Vector2():getGame().getCameraView();GameCanvas.drawText(text,center.x-view.x,center.y-view.y,fontSize,color,align,baseline);}
}
`,
 'Canvas.java': `package engine;
public final class Canvas {
 public double getWidth(){return GameCanvas.getWidth();}public double getHeight(){return GameCanvas.getHeight();}
 public void drawRect(double x,double y,double width,double height,String color){GameCanvas.drawRect(x,y,width,height,color);}
 public void drawText(String text,double x,double y){GameCanvas.drawText(text,x,y,16,"#ffffff","center","middle");}
 public void drawText(String text,double x,double y,double fontSize,String color){GameCanvas.drawText(text,x,y,fontSize,color,"center","middle");}
 public void drawText(String text,double x,double y,double fontSize,String color,String align,String baseline){GameCanvas.drawText(text,x,y,fontSize,color,align,baseline);}
}
`,
  'InputManager.java': `package engine;
public final class InputManager {
 public static final int MOUSE_LEFT=0,MOUSE_MIDDLE=1,MOUSE_RIGHT=2,MOUSE_BACK=3,MOUSE_FORWARD=4;
 private final java.util.HashSet<String> down=new java.util.HashSet<>(),pressed=new java.util.HashSet<>(),released=new java.util.HashSet<>(),consumed=new java.util.HashSet<>();
 private final java.util.HashSet<Integer> mouseDown=new java.util.HashSet<>(),mousePressed=new java.util.HashSet<>(),mouseReleased=new java.util.HashSet<>();
 private Vector2 pointer;
 private String normalize(String key){if(key==null||key.isEmpty())throw new IllegalArgumentException("Niepoprawny klawisz");return key.equals(" ")?"Space":key.length()==1?key.toLowerCase():key;}
 public void setKey(String key,boolean value){key=normalize(key);if(value){if(down.add(key))pressed.add(key);}else if(down.remove(key))released.add(key);}
 public boolean isKeyDown(String key){key=normalize(key);return !consumed.contains(key)&&down.contains(key);}
 public boolean isKeyPressed(String key){key=normalize(key);return !consumed.contains(key)&&pressed.contains(key);}
 public boolean isKeyReleased(String key){key=normalize(key);return !consumed.contains(key)&&released.contains(key);}
 public void consumeKey(String key){consumed.add(normalize(key));}
 public void setPointer(double x,double y){if(!Double.isFinite(x)||!Double.isFinite(y))throw new IllegalArgumentException("Niepoprawny pointer");pointer=new Vector2(x,y);}
 public Vector2 getPointerPosition(){return pointer==null?null:pointer.copy();}
 public void setMouseButton(int button,boolean value){if(button<0||button>4)throw new IllegalArgumentException("Niepoprawny przycisk");if(value){if(mouseDown.add(button))mousePressed.add(button);}else if(mouseDown.remove(button))mouseReleased.add(button);}
 private final java.util.HashSet<Integer> mouseConsumed=new java.util.HashSet<>();
 public void consumeMouse(){consumeMouse(MOUSE_LEFT);}public void consumeMouse(int button){mouseConsumed.add(button);}
 public boolean isMouseDown(int button){return !mouseConsumed.contains(button)&&mouseDown.contains(button);}
 public boolean isMousePressed(int button){return !mouseConsumed.contains(button)&&mousePressed.contains(button);}
 public boolean isMouseReleased(int button){return !mouseConsumed.contains(button)&&mouseReleased.contains(button);}
 public boolean isMouseDown(){return isMouseDown(MOUSE_LEFT);}
 public boolean isMousePressed(){return isMousePressed(MOUSE_LEFT);}
 public boolean isMouseReleased(){return isMouseReleased(MOUSE_LEFT);}
 public void endFrame(){pressed.clear();released.clear();consumed.clear();mousePressed.clear();mouseReleased.clear();mouseConsumed.clear();}
 public void clear(){down.clear();mouseDown.clear();endFrame();}
}
`,
  'Time.java': `package engine;
public final class Time { public double deltaTime,elapsed,unscaledDeltaTime,unscaledElapsed; }
`,
  'Random.java': `package engine;
public final class Random {
 private int state;
 public Random(){this(1);}public Random(int seed){setSeed(seed);}
 public void setSeed(int seed){state=seed==0?1:seed;}
 public double next(){int x=state;x^=x<<13;x^=x>>>17;x^=x<<5;state=x;return (x&0xffffffffL)/4294967296.0;}
 public int nextInt(int min,int max){if(min>=max)throw new IllegalArgumentException("Niepoprawny zakres");return min+(int)Math.floor(next()*((double)max-min));}
 public double range(double min,double max){if(!Double.isFinite(min)||!Double.isFinite(max)||min>max)throw new IllegalArgumentException("Niepoprawny zakres");return min+next()*(max-min);}
}
`,
  'ProgressBar.java': `package engine;
/** Canvas UI: percentages in [0,100], independent of world camera. */
public class ProgressBar extends Component {
 public double width,height;
 public Assets frame=Assets.UI_BAR_HEALTH_FRAME,track=Assets.UI_BAR_HEALTH_TRACK,fill=Assets.UI_BAR_HEALTH_FILL;
 private double progress;
 public ProgressBar(){this(200,20);}
 public ProgressBar(double width,double height){if(!Double.isFinite(width)||!Double.isFinite(height)||width<=0||height<=0)throw new IllegalArgumentException("Niepoprawny pasek");this.width=width;this.height=height;updateMode="UI";}
 public void setProgress(double percent){if(!Double.isFinite(percent))throw new IllegalArgumentException("Niepoprawny postep");progress=Math.max(0,Math.min(100,percent));}
 public double getProgress(){return progress;}
 public void setValue(double value,double max){if(!Double.isFinite(value)||!Double.isFinite(max))throw new IllegalArgumentException("Niepoprawna wartosc");setProgress(max<=0?0:value/max*100);}
 @Override public void onDrawUI(){UIBounds b=UITransform.bounds(this,width,height);GameCanvas.drawProgressBar(b.centerX(),b.centerY(),b.right-b.left,b.bottom-b.top,progress,frame.key(),track.key(),fill.key());}
}
`,
  'Button.java': `package engine;
/** Resizable nine-patch button. UI behavior may call activate() from input. */
public class Button extends Component {
 public double width,height;
 public Assets texture=Assets.UI_BUTTON_BLUE;
 public String text="";
 public double border=8;
 public Runnable onClick;
 public boolean focused;
 private boolean pointerArmed;
 private String keyArmed;
 public Button(){this(160,44);}
 public Button(double width,double height){this.width=width;this.height=height;updateMode="UI";}
 public void activate(){if(enabled&&gameObject.active&&!gameObject.destroyed&&onClick!=null)onClick.run();}
 public boolean focus(){if(!created||!enabled||gameObject==null||!gameObject.active||gameObject.destroyed||removed)return false;for(GameObject o:getGame().getObjects())for(Button b:o.getComponents(Button.class))if(b!=this)b.blur();focused=true;return true;}
 public void blur(){focused=false;pointerArmed=false;keyArmed=null;}
 public boolean isFocused(){return focused&&enabled&&gameObject.active&&!gameObject.destroyed;}
 @Override public void onUpdate(double delta){InputManager input=getGame().input;Vector2 p=input.getPointerPosition();UIBounds b=UITransform.bounds(this,width,height);boolean inside=p!=null&&p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;if(input.isMousePressed(InputManager.MOUSE_LEFT)){pointerArmed=inside;if(inside){focus();input.consumeMouse(InputManager.MOUSE_LEFT);}}if(input.isMouseReleased(InputManager.MOUSE_LEFT)){if(pointerArmed){input.consumeMouse(InputManager.MOUSE_LEFT);if(inside)activate();}pointerArmed=false;}for(String key:new String[]{"Enter","Space"}){if(focused&&input.isKeyPressed(key)){keyArmed=key;input.consumeKey(key);}if(key.equals(keyArmed)&&input.isKeyReleased(key)){keyArmed=null;if(isFocused()){input.consumeKey(key);activate();}}}}
 @Override public void onDrawUI(){UIBounds b=UITransform.bounds(this,width,height);GameCanvas.drawNinePatch(texture.key(),b.centerX(),b.centerY(),b.right-b.left,b.bottom-b.top,border);GameCanvas.drawText(text,b.centerX(),b.centerY(),16,"#ffffff","center","middle");}
}
`,
};
